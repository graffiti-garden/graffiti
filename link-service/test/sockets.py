import jwt
import websockets

token = jwt.encode({
    "type": "token",
    "owner_id": 'test_id'
    }, secret, algorithm="HS256")

async with websockets.connect("ws://localhost:5000") as ws:

    print(await websocket.recv())
