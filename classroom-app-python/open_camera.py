import cv2


def main() -> int:
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Could not open camera 0.")
        return 1

    print("Camera open. Press q in the camera window to quit.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Could not read frame.")
                return 2
            cv2.imshow("Camera - press q to quit", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                return 0
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    raise SystemExit(main())
