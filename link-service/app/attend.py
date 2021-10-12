import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .db import open_redis

ws_interval = int(os.getenv('ATTEND_WS_INTERVAL'))

router = APIRouter()

@router.websocket("/attend")
async def attend(ws: WebSocket):
    # Accept and create object
    await ws.accept()
    at = Attend()

    # Listen for updates
    while True:
        try:
            msg = await ws.receive_json()
        except WebSocketDisconnect:
            break

        # Send it to the object
        await at.receive(ws, msg)

class Attend:

    def __init__(self):
        self.attending = {}
        self.task  = None

    async def receive(self, ws: WebSocket, msg):
        # Kill the task if it exists
        if self.task: self.task.cancel()

        # Add any new stages to attend to
        for stage in msg.get('add', []):
            if not stage: continue
            key = 'stg' + stage
            if key not in self.attending:
                self.attending[key] = '0'

        # And remove stage
        for stage in msg.get('rem', []):
            if not stage: continue
            self.attending.pop('stg' + stage, None)

        # Return the attending list as acknowledgment
        ack = {'attending': [stage[3:] for stage in self.attending.keys()]}
        await ws.send_json(ack)

        # Start a background listening task if non-empty
        if self.attending:
            self.task = asyncio.create_task(self.attend(ws))
        else:
            self.task = None

    async def attend(self, ws: WebSocket):
        # Connect to the database
        r = await open_redis()

        while True:
            # Wait for new events
            events = await r.xread(self.attending,
                                   block=ws_interval)

            # Extract the URLs
            actions = {}
            for stage, stageevents in events:
                stage = stage.decode()[3:]
                actions[stage] = []
                for id_, event in stageevents:
                    self.attending['stg' + stage] = id_
                    actions[stage].append(event[b'act'].decode())

            # Send the output
            obs = {'observed': actions}
            try:
                await ws.send_json(obs)
            except:
                break
