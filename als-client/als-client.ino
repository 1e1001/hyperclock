// log brightness levels in realtime
#include <Esplora.h>

void setup() {
	Serial.begin(9600);
}

void loop() {
	int sw1 = Esplora.readButton(SWITCH_1) == LOW;
	int sw2 = Esplora.readButton(SWITCH_2) == LOW;
	int sw3 = Esplora.readButton(SWITCH_3) == LOW;
	int sw4 = Esplora.readButton(SWITCH_4) == LOW;
	int light = Esplora.readLightSensor();
	byte buffer[2] = {
		light & 255,
		light >> 8| sw1 << 4 | sw2 << 5 | sw3 << 6 | sw4 << 7,
	};
	Serial.write(buffer, 2);
	delay(10);
}
