from fastapi import APIRouter, Depends
import time
from uuid import uuid4
from .auth import token_to_user
from .db import get_db

router = APIRouter()

@router.on_event("startup")
async def start_db():
    global db
    db = await get_db()

@router.put('/put')
async def put(
        obj: dict,
        near_misses: list[dict],
        access: list[str]|None=None,
        user: str=Depends(token_to_user)):

    # Sign and date the object and give it a random ID
    obj['signed'] = user
    obj['created'] = time.time_ns()
    obj['uuid'] = str(uuid4())

    # Fill in the near misses with object values
    # if they are not specified.
    for near_miss in near_misses:
        fill_with_template(near_miss, obj)

    # Combine it into one big document
    data = {
        "object": [obj],
        "near_misses": near_misses,
        "access": access
    }

    # Insert it into the database
    await db.insert_one(data)
    return {'type': 'Accept', 'uuid': obj['uuid'], 'created': obj['created']}

def fill_with_template(target, template):
    for entry in template:
        if entry not in target:
            target[entry] = template[entry]
        else:
            if isinstance(target[entry], dict) and isinstance(template[entry], dict):
                # Recursively fill
                fill_with_template(target[entry], template[entry])
