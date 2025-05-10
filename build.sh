mkdir -p ./js/bin
rm ./js/bin/*

env GOOS=linux GOARCH=amd64 go build -o ./js/bin/embedcss_x86_linux.o .
env GOOS=linux GOARCH=arm64 go build -o ./js/bin/embedcss_arm64_linux.o .
env GOOS=linux GOARCH=arm go build -o ./js/bin/embedcss_arm_linux.o .

env GOOS=darwin GOARCH=amd64 go build -o ./js/bin/embedcss_x86_darwin.o .
env GOOS=darwin GOARCH=arm64 go build -o ./js/bin/embedcss_arm64_darwin.o .

env GOOS=windows GOARCH=amd64 go build -o ./js/bin/embedcss_x86_windows.exe .
env GOOS=windows GOARCH=arm64 go build -o ./js/bin/embedcss_arm64_windows.exe .
env GOOS=windows GOARCH=arm go build -o ./js/bin/embedcss_arm_windows.exe .
