all: init
	@tsc
	@./build.sh dev

prod:
	@tsc
	@./build.sh prod

# init creates a seed for both development deployments and production
# deployments.
init:
	@./init.sh
