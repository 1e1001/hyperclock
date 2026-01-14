BOARD = -b arduino:avr:esplora
PORT = -p /dev/ttyACM*

compile:
	arduino-cli compile ${BOARD}

upload: compile
	arduino-cli upload ${BOARD} ${PORT} -v -t

monitor:
	arduino-cli monitor ${PORT} | xxd -c4
