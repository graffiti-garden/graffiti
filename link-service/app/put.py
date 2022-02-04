import time
import json
from uuid import UUID
from pymongo import MongoClient
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException
from .auth import token_to_user

router = APIRouter()
db = MongoClient('db').graffiti

@router.put('/put')
async def put(
        activity:    Optional[str] = None,
        near_misses: Optional[List[str]] = [],
        access:      Optional[List[UUID]] = [],
        user:        UUID = Depends(token_to_user)):

    # Sign and date the activity
    activity = parse_activity(activity)
    activity['signed'] = str(user)
    activity['created'] = time.time_ns()

    # Combine it into one big document
    data = {
        "activity": activity,
        "near_misses": [parse_activity(nm) for nm in near_misses],
        "access": [str(i) for i in access]
    }

    # Insert it into the database
    output = db.activities.insert_one(data)

    return 'OK'

def parse_activity(activity):
    try:
        activity = json.loads(activity)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {activity}")
    if not isinstance(activity, dict):
        raise HTTPException(status_code=400, detail=f"JSON root is not a dictionary: {activity}")
    return activity

if __name__ == "__main__":
    import asyncio
    from uuid import uuid4

    activity = {"type": "Note", "content": "Hello World 2"}
    uri = asyncio.run(put(
        json.dumps(activity),
        [], [], uuid4()
        ))

    # Print out the activities
    cursor = db.activities.find({})
    for document in cursor:
          print(document)
