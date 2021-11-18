.PHONY: clean

all:
	@./build.sh

clean:
	@rm -r build build-cache */ts-out skynet-kernel-extension/ts-src
