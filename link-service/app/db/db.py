from uuid import uuid4
from os import getenv
import asyncio
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import APIRouter, Depends, WebSocket, HTTPException, Body
from ..token import token_to_owner_id
from .broker import QueryBroker
from .socket import QuerySocket
from .rewrite import object_rewrite, query_rewrite

max_limit = float(getenv('QUERY_LIMIT'))

router = APIRouter()

client = AsyncIOMotorClient('mongo')
db = client.graffiti.objects
qb = QueryBroker(db)
open_sockets = {}

@router.on_event("startup")
async def startup():
    client.get_io_loop = asyncio.get_running_loop

    # Create indexes if they don't already exist
    await db.create_index('owner_id')
    await db.create_index('object._id')
    await db.create_index('object._timestamp')
    await db.create_index('object.$**')
    await db.create_index('contexts.$**')

class Context(BaseModel):
    nearMisses: list[dict] = []
    neighbors:  list[dict] = []

@router.post('/update')
async def update(
        object: dict,
        contexts: list[Context] = [],
        owner_id: str = Depends(token_to_owner_id)):

    if not owner_id:
        raise HTTPException(status_code=401, detail="you can't update an object without logging in.")

    # Unpack the contexts
    contexts = [context.dict() for context in contexts]
    
    # If there is no id, we are replacing
    replacing = ('_id' in object)

    # Make a new document out of the object
    try:
        new_doc = object_rewrite(object, contexts, owner_id)
    except Exception as e:
        raise HTTPException(status_code=405, detail=f"improperly formatted object: {str(e)}")
    object_id = new_doc['object'][0]['_id']

    if replacing:

        # Check that the object that already exists
        # and that it is owned by the owner
        old_doc = await db.find_one({
            "object._id": object_id,
            "owner_id": owner_id})
        if not old_doc:
            raise HTTPException(status_code=404, detail="the object you're trying to replace either doesn't exist or you don't have permission to replace it.")

        # Check what queries the object matches before replacement
        matches_before = await qb.match_socket_queries(object_id)

        # Replace the old document with the new
        await db.replace_one({"object._id": object_id}, new_doc)

    else:
        # The object is new so nothing previously matched
        matches_before = []

        # And insert it into the database
        await db.insert_one(new_doc)

    # Check what queries the object matches after it's inserted
    matches_after = await qb.match_socket_queries(object_id)

    # If a query matched before but not after, the object has gone
    # out of scope for that query so send a deletion.
    for socket_id, query_id in matches_before:
        if socket_id not in open_sockets:
            continue
        if (socket_id, query_id) not in matches_after:
            await open_sockets[socket_id].delete(query_id, object_id)

    # Otherwise send a replacement
    for socket_id, query_id in matches_after:
        if socket_id not in open_sockets:
            continue
        await open_sockets[socket_id].update(query_id, new_doc)

    return object_id

@router.post('/delete')
async def delete(
        object_id: str = Body(..., embed=True),
        owner_id: str = Depends(token_to_owner_id)):

    if not owner_id:
        raise HTTPException(status_code=401, detail="you can't delete an object without logging in.")

    # Check that the object that already exists
    # and that it is owned by the signer
    old_doc = await db.find_one({
        "object._id": object_id,
        "owner_id": owner_id})

    if not old_doc:
        raise HTTPException(status_code=404, detail="the object you're trying to delete either doesn't exist or you don't have permission to replace it.")

    # Check what queries this object affects
    matches = await qb.match_socket_queries(object_id)

    # Perform deletion
    await db.delete_one({"object._id": object_id})

    # Propagate the changes to the sockets
    for socket_id, query_id in matches:
        if socket_id not in open_sockets:
            continue
        await open_sockets[socket_id].delete(query_id, object_id)

    return object_id

@router.post("/query_many")
async def query_many(
        query: dict,
        limit: int = Body(..., gt=0, le=max_limit),
        sort: list[tuple[str,int]] | None = None,
        owner_id: str = Depends(token_to_owner_id)):

    # Do rewriting for contexts
    try:
        query = query_rewrite(query, owner_id)
    except Exception as e:
        raise HTTPException(status_code=405, detail=f"improperly formatted query: {str(e)}")

    # Sort reverse chronological and by ID
    if sort is None:
        sort = [('_timestamp', -1), ('_id', -1)]
    # Rewrite it to all be within the object scope
    sort = [('object.' + s, i) for (s, i) in sort]

    # Perform the query
    try:
        cursor = db.find(
                query,
                sort=sort,
                limit=limit)
        results = await cursor.to_list(length=limit)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"query error: {str(e)}")

    await cursor.close()
    results = [{
        'object': r['object'][0],
        'contexts': r['contexts'],
        } for r in results]

    return results

@router.post("/query_one")
async def query_one(
        query: dict,
        sort: list[tuple[str,int]] | None = None,
        owner_id: str = Depends(token_to_owner_id)):

    results = await query_many(query, limit=1, sort=sort, owner_id=owner_id)

    if results:
        return results[0]
    else:
        return None

@router.websocket("/query_socket")
async def query_socket(ws: WebSocket):
    # Open a query socket
    socket_id = str(uuid4())
    open_sockets[socket_id] = QuerySocket(ws)
    qb.add_socket(socket_id)

    # Wait until it dies
    await open_sockets[socket_id].heartbeat(socket_id)

    # Remove the query
    qb.delete_socket(socket_id)
    del open_sockets[socket_id]

@router.post("/update_socket_query")
async def update_socket_query(
        query: dict,
        query_id: str = Body(...),
        socket_id: str = Body(...),
        owner_id: str = Depends(token_to_owner_id)):

    # Rewrite the query and check if its valid
    query = query_rewrite(query, owner_id)
    # (if it isn't this will error)
    try:
        await db.find_one(query)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"query error: {str(e)}")

    # Make sure the socket is valid and add
    validate_socket(socket_id)
    qb.update_query(socket_id, query_id, query)

@router.post("/delete_socket_query")
async def delete_socket_query(
        query_id: str = Body(...),
        socket_id: str = Body(...)):

    # Make sure the socket is valid and delete
    validate_socket(socket_id)
    qb.delete_query(socket_id, query_id)

def validate_socket(socket_id):
    if not socket_id in open_sockets:
        raise HTTPException(status_code=404, detail=f"a socket with id {socket_id} is not open")
