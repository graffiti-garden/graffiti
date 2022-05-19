import json
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from aio_pika import Message
from contextlib import asynccontextmanager

from .rewrite import object_rewrite

class Rest:

    def __init__(self, db, mq):
        self.db = db
        self.object_locks = {}

        self.initialized = asyncio.Event()
        asyncio.create_task(self.initialize(mq))

    async def initialize(self, mq):
        # Create a queue that updates the broker about
        # insertions and deletions
        self.channel = await mq.channel()
        self.modify_queue = await self.channel.declare_queue(
                'modifications')
        self.initialized.set()

    async def modify(self, _type, _id): 
        await self.initialized.wait()
        await self.channel.default_exchange.publish(
            Message(json.dumps({
                'type': _type,
                'id': _id
            }).encode()),
            routing_key=self.modify_queue.name
        )

    async def update(self, object, owner_id):
        self.validate_owner_id(owner_id)

        # If there is no id, we are replacing
        replacing = ('_id' in object)

        # Make a new document out of the object
        # (this might raise an exception)
        object_id, doc = object_rewrite(object, owner_id)

        # Make sure no one else is modifying the object
        async with self.object_lock(object_id):

            if replacing:
                # Delete the old document
                await self._delete(object_id, owner_id)

            # Then insert the new one into the database
            result = await self.db.insert_one(doc)

            # Mark that the new document has been inserted
            await self.modify('insert', str(result.inserted_id))

        return object_id

    async def delete(object_id, owner_id):
        self.validate_owner_id(owner_id)

        async with self.object_lock(object_id):
            _delete(object_id, owner_id)

    async def _delete(object_id, owner_id):
        # Check that the object that already exists
        # that it is owned by the owner_id,
        # and that it is not scheduled for deletion
        old_doc = await db.find_one({
            "id_": { "$nin": self.qb.deleted_ids() },
            "object._id": object_id,
            "owner_id": owner_id})

        if not old_doc:
            raise Exception("\
            the object you're trying to modify either\
            doesn't exist or you don't have permission\
            to modify it.")

        # Mark the document for deletion
        # (objects aren't fully deleted until
        #  assessed by the broker)
        await self.modify('delete', old_doc['_id'])

    @asynccontextmanager
    async def object_lock(self, object_id):
        """
        Make sure you can't perform multiple updates
        or deletions on one object at the same time.
        """
        if object_id not in self.object_locks:
            self.object_locks[object_id] = asyncio.Lock()
        async with self.object_locks[object_id]:
            yield
        if not self.object_locks[object_id]._waiters:
            del self.object_locks[object_id]

    def validate_owner_id(self, owner_id):
        if not owner_id:
            raise Exception(\
            "you can't modify objects without logging in.")
