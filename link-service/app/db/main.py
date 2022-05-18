import asyncio
from fastapi import APIRouter, Depends, WebSocket
from ..token import token_to_owner_id
from .schema import socket_schema

router = APIRouter()

x = y = None

@router.on_event("startup")
async def startup():
    # Initialize the database
    client = AsyncIOMotorClient('mongo')
    db = client.graffiti.objects

    # Create indexes if they don't already exist
    await db.create_index('owner_id')
    await db.create_index('object._id')
    await db.create_index('object._timestamp')
    await db.create_index('object.$**')
    await db.create_index('contexts.$**')

    # Initialize the message broker

    y = SomethingElse(db, mq)
    x = PubSubManager(db, mq)

@router.websocket("/socket")
async def query_socket(ws: WebSocket, owner_id: str = Depends(token_to_owner_id)):
    await ws.accept()

    # Register with the broker
    async with be.register(ws) as socket_id:

        # Send messages back and forth
        while True:
            msg = await ws.receive_msg()
            await reply(ws, msg, socket_id, owner_id)

async def reply(ws, msg, socket_id, owner_id):

    try:
        # Make sure the message is formatted properly
        jsonschema.validate(msg, socket_schema(owner_id))

        output = {
            'type': 'success',
            # echo the incoming message ID
            'messageID': msg['messageID']
        }

        if msg['type'] == 'update':
            object_id = await db.update(msg['object'], owner_id)
            output['objectID'] = object_id

        elif msg['type'] == 'delete':
            await db.delete(msg['objectID'], owner_id)

        elif msg['type'] == 'subscribe':
            await be.subscribe(socket_id, msg['query'], owner_id)
            output['queryHash'] = query_hash

        elif msg['type'] == 'unsubscribe':
            await be.subscribe(socket_id, msg['queryHash'])

    except Exception as e:
        ws.send_json({
            'type': 'error',
            'detail': str(e)
        })

    else:
        ws.send_json(output)
