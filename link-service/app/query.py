import json
from os import getenv
from asyncio import create_task
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .auth import token_to_user
from .db import open_redis
from .pod import get

ws_interval = int(getenv('ATTEND_WS_INTERVAL'))
actions_per_message = int(getenv('ATTEND_WS_ACTIONS_PER_MESSAGE'))

router = APIRouter()

@router.websocket("/attend")
async def attend(ws: WebSocket, token: str):

    # Make sure the token is valid
    user = token_to_user(token)

    # Accept and create object
    await ws.accept()
    at = Attend(user)

    # Listen for updates
    while True:
        try:
            msg = await ws.receive_json()
        except WebSocketDisconnect:
            at.cancel()
            break

        # Send it to the object
        await at.receive(ws, msg)

class Attend:

    def __init__(self, user):
        self.user = user
        self.stages = {}
        self.task  = None

    def cancel(self):
        if self.task:
            self.task.cancel()

    async def receive(self, ws: WebSocket, msg: dict):
        # Kill the task if it exists
        self.cancel()

        # Update the stage attendance and return an acknowledgment
        for stage in msg['stages']:
            if stage not in self.stages:
                self.stages[stage] = msg['stages'][stage]
        for stage in self.stages:
            if stage not in msg['stages']:
                del self.stages[stage]
        await ws.send_json({'stages': self.stages})

        # Start a background listening task if non-empty
        if self.stages:
            self.task = create_task(self.attend(ws))
        else:
            self.task = None

    async def attend(self, ws: WebSocket):
        # Connect to the database
        r = await open_redis()

        while True:
            # Wait for new events
            stages = {'stage' + stage: id_ for stage, id_ in self.stages.items()}
            events = await r.xread(stages, block=ws_interval, count=actions_per_message)

            # Extract the actions
            actions = {}
            # For each stage and it's corresponding events
            for stage, stageevents in events:
                stage = stage.decode()[5:]
                actions[stage] = []

                # Iterate over the events
                for id_, event in stageevents:
                    self.stages[stage] = id_.decode()

                    # Fetch the action from the pod
                    try:
                        action = await get(event[b'hash'].decode())
                    except Exception as e:
                        continue

                    # Filter out actions not intended for the user
                    if 'recipients' in action:
                        if user not in action['recipients']:
                            continue

                    # Accumulate
                    actions[stage].append(action)

            # Send the output
            try:
                await ws.send_json({
                    'actions': actions,
                    'stages' : self.stages
                    })
            except:
                break
