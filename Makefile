.PHONY: clean

all:
	@./build.sh

clean:
	@rm -rf build build-cache */bundle */ts-out
