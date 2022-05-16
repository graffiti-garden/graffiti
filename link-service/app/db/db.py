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
object_locks = {}
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

    # Start up the query broker
    asyncio.create_task(broker_loop())


"""
This function runs in the background and updates
sockets about added or deleted documents in batches.
"""
async def broker_loop():
    while True:
        something_happened = False
        async for query_hash, result in qb.process_batch():
            something_happened = True

            # Find all the sockets associated with the query hash
            # Send the result to them
            print(query_hash)
            print(result)

        if not something_happened:
            # If there was nothing to do,
            # sleep so we don't go into an infinite loop
            await asyncio.sleep(0.01)


@asynccontextmanager
async def object_lock(object_id):
    """
    Make sure you can't perform multiple updates
    or deletions on an object at the same time.
    """
    if object_id not in object_locks:
        object_locks[object_id] = asyncio.Lock()
    async with object_locks[id]:
        yield
    if len(object_locks[id]._waiters) == 0:
        del object_locks[id]


@router.post('/update')
async def update(
        object: dict,
        owner_id: str = Depends(token_to_owner_id)):

    if not owner_id:
        raise HTTPException(status_code=401, detail="you can't update an object without logging in.")
    
    # If there is no id, we are replacing
    replacing = ('_id' in object)

    # Make a new document out of the object
    try:
        new_doc = object_rewrite(object, owner_id)
    except Exception as e:
        raise HTTPException(status_code=405, detail=f"improperly formatted object: {str(e)}")
    object_id = new_doc['object'][0]['_id']

    async with object_lock(object_id):

        if replacing:
            # Delete the object
            await _delete(object_id, owner_id)

        # Then insert it into the database
        result = await db.insert_one(new_doc)

        # Mark the new document for creation
        qb.add_id(result.inserted_id)

    return object_id


@router.post('/delete')
async def delete(
        object_id: str = Body(..., embed=True),
        owner_id: str = Depends(token_to_owner_id)):

    if not owner_id:
        raise HTTPException(status_code=401, detail="you can't delete an object without logging in.")

    async with object_lock(object_id):
        await _delete(object_id, owner_id)

    return object_id


async def _delete(object_id, owner_id):
    # Check that the object that already exists
    # that it is owned by the owner_id,
    # and that it is not scheduled for deletion
    old_doc = await db.find_one({
        "id_": { "$nin": list(delete_ids.union(deleting_ids)) },
        "object._id": object_id,
        "owner_id": owner_id})

    if not old_doc:
        deleting.remove(object_id)
        raise HTTPException(status_code=404, detail="the object you're trying to modify either doesn't exist or you don't have permission to modify it.")

    # Mark the document for deletion
    qb.delete_id(old_doc["_id"])


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

    # Wait until it dies
    await open_sockets[socket_id].heartbeat(socket_id)

    # Remove the query
    del open_sockets[socket_id]
    # Remove it from anything that uses it

@router.post("/update_socket_query")
async def update_socket_query(
        query: dict,
        query_id: str = Body(...),
        socket_id: str = Body(...),
        owner_id: str = Depends(token_to_owner_id)):

    # Make sure the socket is valid and add
    validate_socket(socket_id)

    try:
        await qb.add_query(query)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"query error: {str(e)}")

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
