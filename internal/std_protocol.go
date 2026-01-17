// protocol encoding/decoding has been taken from the esbuild project source code:
// https://github.com/evanw/esbuild/blob/main/cmd/esbuild/stdio_protocol.go

package internal

import (
	"embedcss_compiler/logger"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"reflect"
	"sort"
	"sync"
	"time"
)

var nextId uint32 = 1
var nextIdMutex sync.Mutex

func getNextId() uint32 {
	nextIdMutex.Lock()
	id := nextId
	nextId++
	nextIdMutex.Unlock()
	return id
}

func readUint32(bytes []byte) (value uint32, leftOver []byte, ok bool) {
	if len(bytes) >= 4 {
		return binary.LittleEndian.Uint32(bytes), bytes[4:], true
	}

	return 0, bytes, false
}

func writeUint32(bytes []byte, value uint32) []byte {
	bytes = append(bytes, 0, 0, 0, 0)
	binary.LittleEndian.PutUint32(bytes[len(bytes)-4:], value)
	return bytes
}

func readLengthPrefixedSlice(bytes []byte) (slice []byte, leftOver []byte, ok bool) {
	if length, afterLength, ok := readUint32(bytes); ok && uint(len(afterLength)) >= uint(length) {
		return afterLength[:length], afterLength[length:], true
	}

	return []byte{}, bytes, false
}

type Packet struct {
	value     interface{}
	id        uint32
	isRequest bool
}

func NewResponsePacket(request Packet, responseValue interface{}) Packet {
	return Packet{
		id:        request.id,
		isRequest: false,
		value:     responseValue,
	}
}

func NewRequestPacket(value Request) Packet {
	return Packet{
		id:        getNextId(),
		isRequest: true,
		value:     value.ToMap(),
	}
}

type TypeKindEnum struct {
	Nil            uint8
	Bool           uint8
	Int            uint8
	String         uint8
	StringSlice    uint8
	ByteSlice      uint8
	InterfaceSlice uint8
	Map            uint8
}

var TypeKind = TypeKindEnum{
	Nil:            0,
	Bool:           1,
	Int:            2,
	String:         3,
	StringSlice:    4,
	ByteSlice:      5,
	InterfaceSlice: 6,
	Map:            7,
}

func encodePacket(p Packet) []byte {
	var visit func(interface{})
	var bytes []byte

	visit = func(value interface{}) {
		switch v := value.(type) {
		case nil:
			bytes = append(bytes, TypeKind.Nil)

		case bool:
			n := uint8(0)
			if v {
				n = 1
			}
			bytes = append(bytes, TypeKind.Bool, n)

		case int:
			bytes = append(bytes, TypeKind.Int)
			bytes = writeUint32(bytes, uint32(v))

		case string:
			bytes = append(bytes, TypeKind.String)
			bytes = writeUint32(bytes, uint32(len(v)))
			bytes = append(bytes, v...)

		case []string:
			bytes = append(bytes, TypeKind.StringSlice)
			var sliceBytes []byte
			for _, v := range v {
				sliceBytes = writeUint32(sliceBytes, uint32(len(v)))
				sliceBytes = append(sliceBytes, v...)
			}
			bytes = writeUint32(bytes, uint32(len(sliceBytes)))
			bytes = append(bytes, sliceBytes...)

		case []byte:
			bytes = append(bytes, TypeKind.ByteSlice)
			bytes = writeUint32(bytes, uint32(len(v)))
			bytes = append(bytes, v...)

		case []interface{}:
			bytes = append(bytes, TypeKind.InterfaceSlice)
			bytes = writeUint32(bytes, uint32(len(v)))
			for _, item := range v {
				visit(item)
			}

		case map[string]interface{}:
			// Sort keys for determinism
			keys := make([]string, 0, len(v))
			for k := range v {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			bytes = append(bytes, TypeKind.Map)
			bytes = writeUint32(bytes, uint32(len(keys)))
			for _, k := range keys {
				bytes = writeUint32(bytes, uint32(len(k)))
				bytes = append(bytes, k...)
				visit(v[k])
			}

		default:
			typeName := reflect.TypeOf(value).String()
			panic("Invalid packet: " + typeName)
		}
	}

	bytes = writeUint32(bytes, 0) // Reserve space for the length
	if p.isRequest {
		bytes = writeUint32(bytes, p.id<<1)
	} else {
		bytes = writeUint32(bytes, (p.id<<1)|1)
	}
	visit(p.value)
	writeUint32(bytes[:0], uint32(len(bytes)-4)) // Patch the length in
	return bytes
}

func decodePacket(bytes []byte) (Packet, bool) {
	var visit func() (interface{}, bool)

	visit = func() (interface{}, bool) {
		kind := bytes[0]
		bytes = bytes[1:]
		switch kind {
		case TypeKind.Nil: // nil
			return nil, true

		case TypeKind.Bool: // bool
			value := bytes[0]
			bytes = bytes[1:]
			return value != 0, true

		case TypeKind.Int: // int
			value, next, ok := readUint32(bytes)
			if !ok {
				return nil, false
			}
			bytes = next
			return int(value), true

		case TypeKind.String: // string
			value, next, ok := readLengthPrefixedSlice(bytes)
			if !ok {
				return nil, false
			}
			bytes = next
			return string(value), true

		case TypeKind.ByteSlice: // []byte
			value, next, ok := readLengthPrefixedSlice(bytes)
			if !ok {
				return nil, false
			}
			bytes = next
			return value, true

		case TypeKind.StringSlice: // []string
			count, next, ok := readUint32(bytes)
			if !ok {
				return nil, false
			}
			bytes = next[count:]
			sliceBytes := next[:count]
			var value []string
			for true {
				if len(sliceBytes) == 0 {
					break
				}
				itemLength, next, ok := readUint32(sliceBytes)
				if !ok {
					return nil, false
				}
				sliceBytes = next
				item := sliceBytes[:itemLength]
				sliceBytes = sliceBytes[itemLength:]
				value = append(value, string(item))
			}
			return value, true

		case TypeKind.InterfaceSlice: // []interface{}
			count, next, ok := readUint32(bytes)
			if !ok {
				return nil, false
			}
			bytes = next
			value := make([]interface{}, count)
			for i := 0; i < int(count); i++ {
				item, ok := visit()
				if !ok {
					return nil, false
				}
				value[i] = item
			}
			return value, true

		case TypeKind.Map: // map[string]interface{}
			count, next, ok := readUint32(bytes)
			if !ok {
				return nil, false
			}
			bytes = next
			value := make(map[string]interface{}, count)
			for i := 0; i < int(count); i++ {
				key, next, ok := readLengthPrefixedSlice(bytes)
				if !ok {
					return nil, false
				}
				bytes = next
				item, ok := visit()
				if !ok {
					return nil, false
				}
				value[string(key)] = item
			}
			return value, true

		default:
			panic("Invalid packet")
		}
	}

	id, bytes, ok := readUint32(bytes)
	if !ok {
		return Packet{}, false
	}
	isRequest := (id & 1) == 0
	id >>= 1
	value, ok := visit()
	if !ok {
		return Packet{}, false
	}
	if len(bytes) != 0 {
		return Packet{}, false
	}
	return Packet{id: id, isRequest: isRequest, value: value}, true
}

type Request struct {
	Command string
	Args    []string
}

func (r *Request) FromMap(m map[string]interface{}) {
	r.Command = m["Command"].(string)
	r.Args = m["Args"].([]string)
}

func (r Request) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"Command": r.Command,
		"Args":    r.Args,
	}
}

type StdioService struct {
	wg               sync.WaitGroup
	out              chan []byte
	requestHandlers  map[string]func(Request) (map[string]interface{}, error)
	responseHandlers map[uint32]func(interface{})
}

func (service *StdioService) receivePacket(bytes []byte) {
	p, ok := decodePacket(bytes)
	if !ok {
		logger.Debug("failed to decode the packet")
		return
	}
	logger.Debugf("packet received { isRequest: %v, id: %v, value: %v }", p.isRequest, p.id, p.value)

	if p.isRequest {
		if requestMap, ok := p.value.(map[string]interface{}); ok {
			var request Request
			request.FromMap(requestMap)
			if handler, ok := service.requestHandlers[request.Command]; ok {
				response, err := handler(request)
				if err != nil {
					service.Send(NewResponsePacket(p, map[string]interface{}{
						"Error": true,
						"Msg":   err.Error(),
					}))
				} else {
					service.Send(NewResponsePacket(p, response))
				}
				return
			}
			service.Send(NewResponsePacket(p, map[string]interface{}{
				"Error": true,
				"Msg":   "no handler for command: " + request.Command,
			}))
			return
		}
		service.Send(NewResponsePacket(p, map[string]interface{}{
			"Error": true,
			"Msg":   "unable to parse the request",
		}))
		return
	} else {
		if handler, ok := service.responseHandlers[p.id]; ok {
			handler(p.value)
			delete(service.responseHandlers, p.id)
		} else {
			panic("unexpected response")
		}
	}
}

func (service *StdioService) Command(cmd string, handler func(Request) (map[string]interface{}, error)) {
	service.requestHandlers[cmd] = handler
}

func (service *StdioService) Send(packet Packet) {
	service.wg.Add(1)
	service.out <- encodePacket(packet)
}

func NewService() *StdioService {
	return &StdioService{
		out:              make(chan []byte),
		wg:               sync.WaitGroup{},
		requestHandlers:  map[string]func(Request) (map[string]interface{}, error){},
		responseHandlers: map[uint32]func(interface{}){},
	}
}

func (service *StdioService) Start() {
	service.wg.Add(1)
	service.Command("exit", func(Request) (map[string]interface{}, error) {
		os.Exit(0)
		return nil, nil
	})

	go func() {
		for packet := range service.out {
			logger.Debugf("sending packet")

			if _, err := os.Stdout.Write(packet); err != nil {
				fmt.Println("Error: ", err)
				os.Exit(1) // I/O error
			}
			service.wg.Done()
		}
	}()

	go func() {
		for {
			pingResponded := false
			request := NewRequestPacket(Request{
				Command: "ping",
			})
			service.responseHandlers[request.id] = func(interface{}) {
				pingResponded = true
			}
			service.Send(request)

			time.Sleep(2 * time.Second)
			if !pingResponded {
				os.Exit(1) // No response to ping
			}
		}
	}()

	buffer := make([]byte, 16*1024)
	stream := []byte{}
	for {
		// Read more data from stdin
		n, err := os.Stdin.Read(buffer)
		if n == 0 || err == io.EOF {
			break // End of stdin
		}
		if err != nil {
			panic(err)
		}
		stream = append(stream, buffer[:n]...)

		// Process all complete (i.e. not partial) packets
		bytes := stream
		for {
			packet, afterPacket, ok := readLengthPrefixedSlice(bytes)
			if !ok {
				break
			}
			bytes = afterPacket

			// Clone the input since slices into it may be used on another goroutine
			clone := append([]byte{}, packet...)
			go service.receivePacket(clone)
		}

		// Move the remaining partial packet to the end to avoid reallocating
		stream = append(stream[:0], bytes...)
	}

	service.wg.Wait()
}
