.PHONY: clean

all:
	@./build.sh

clean:
	@rm -r build build-cache
