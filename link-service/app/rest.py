import json
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager

from .rewrite import object_to_doc

class Rest:

    def __init__(self, db, redis):
        self.db = db
        self.redis = redis
        self.object_locks = {}
        self.deleted_ids = set()

    async def update(self, object, owner_id):
        self.validate_owner_id(owner_id)

        # If there is no id, we are replacing
        replacing = ('_id' in object)

        # Make a new document out of the object
        object_id, doc = object_to_doc(object, owner_id)

        # Lock to make sure no one else is modifying the object
        lock = self.redis.lock(object_id)
        await lock.acquire()

        try:
            if replacing:
                # Delete the old document
                await self._delete(object_id, owner_id)

            # Then insert the new one into the database
            result = await self.db.insert_one(doc)

            # Mark that the new document has been inserted
            await self.redis.publish("inserts", str(result.inserted_id))

        finally:
            await lock.release()

        return object_id

    async def delete(self, object_id, owner_id):
        self.validate_owner_id(owner_id)

        lock = self.redis.lock(object_id)
        await lock.acquire()
        try:
            await self._delete(object_id, owner_id)
        finally:
            await lock.release()

    async def _delete(self, object_id, owner_id):
        # Check that the object that already exists
        # that it is owned by the owner_id,
        # and that it is not scheduled for deletion
        # If so, schedule it for deletion
        doc = await self.db.find_one_and_update({
            "_object._id": object_id,
            "_owner_id": owner_id,
            "_tombstone": False
        }, {
            "$set": { "_tombstone": True }
        })

        if not doc:
            raise Exception("""\
the object you're trying to modify either \
doesn't exist or you don't have permission \
to modify it.""")

        # And publish the change to the broker
        await self.redis.publish("deletes", str(doc['_id']))

    def validate_owner_id(self, owner_id):
        if not owner_id:
            raise Exception("you can't modify objects without logging in.")
