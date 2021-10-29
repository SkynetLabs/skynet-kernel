.PHONY: clean

PORTAL = https://siasky.net

all:
	@./upload.sh $(PORTAL)

clean:
	rm -r build
