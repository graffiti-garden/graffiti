from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
import time
import json
from uuid import UUID, uuid4
from .auth import token_to_user
from .db import get_db

router = APIRouter()
db = get_db()

@router.put('/put')
async def put(
        obj: str,
        near_misses: Optional[str] = '[]',
        access:      Optional[List[UUID]] = None,
        user:        UUID = Depends(token_to_user)):

    # Sign the object and give it a random ID
    obj = parse_object(obj)
    obj['signed'] = str(user)
    obj['uuid'] = str(uuid4())

    # TODO: clean this up
    try:
        near_misses = json.loads(near_misses)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Object has invalid JSON: {obj}")
    if not isinstance(near_misses, list):
        raise HTTPException(status_code=400, detail=f"Object root is not an list: {obj}")

    # Combine it into one big document
    data = {
        "object": [obj],
        "near_misses": near_misses,
        "access": access
    }

    # Insert it into the database
    result = await db.insert_one(data)
    if result.acknowledged:
        print(data)
        return {"type": "Accept", "uuid": obj['uuid']}
    else:
        raise HTTPException(status_code=400, detail=f"Object could not be written to the database")

def parse_object(obj):
    try:
        obj = json.loads(obj)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Object has invalid JSON: {obj}")
    if not isinstance(obj, dict):
        raise HTTPException(status_code=400, detail=f"Object root is not an object: {obj}")
    return obj
