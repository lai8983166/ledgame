import serial
import time

PORT = "COM6"
BAUD = 921600
WIDTH = 16
HEIGHT = 16
NUM_LEDS = WIDTH * HEIGHT
FRAME_SIZE = NUM_LEDS * 3

print(f"Opening {PORT} at {BAUD}...")
ser = serial.Serial(PORT, BAUD, timeout=1)
time.sleep(3)
print("Serial opened.")

def send_frame(frame, name):
    assert len(frame) == FRAME_SIZE

    written = ser.write(frame)
    ser.flush()

    ack = ser.read(1)

    print(f"Sent {name}: {written} bytes, ack={ack}")

def solid(r, g, b):
    frame = bytearray()
    for _ in range(NUM_LEDS):
        frame += bytes([r, g, b])
    return frame

send_frame(solid(255, 0, 0), "red")
time.sleep(1)

send_frame(solid(0, 255, 0), "green")
time.sleep(1)

send_frame(solid(0, 0, 255), "blue")
time.sleep(1)

print("Scanning... Ctrl+C to stop.")

try:
    while True:
        for pos in range(NUM_LEDS):
            frame = bytearray(FRAME_SIZE)
            frame[pos * 3 + 0] = 255
            frame[pos * 3 + 1] = 80
            frame[pos * 3 + 2] = 0

            ser.write(frame)
            ser.flush()
            ser.read(1)

            time.sleep(0.02)
except KeyboardInterrupt:
    print("Stopped.")
finally:
    ser.close()