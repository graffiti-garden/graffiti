from .schema import query_access

async def update(db, object, owner_id):
    # Make sure the owner is logged in
    if not owner_id:
        raise Exception("you can't modify objects without logging in.")

    # Make sure the object is by the user
    if object['_by'] != owner_id:
        raise Exception("you can only create objects _by yourself.")

    # Insert the new object
    old_object = await db.find_one_and_replace({
        "_key": object['_key'],
        "_by": object['_by']
    }, object, upsert=True)

    if old_object:
        return "replaced"
    else:
        return "inserted"

async def remove(db, object_key, owner_id):
    # Make sure the owner is logged in
    if not owner_id:
        raise Exception("you can't modify objects without logging in.")

    # Set the old tags as deleting
    old_object = await db.find_one_and_delete({
        "_key": object_key,
        "_by": owner_id,
    })

    if not old_object:
        raise Exception("""\
the object you're trying to modify either \
doesn't exist or you don't have permission \
to modify it.""")

    return "removed"

async def get(db, user_id, object_key, owner_id):
    # Look to see if there is an object matching the description
    object = await db.find_one({
        "_by": user_id,
        "_key": object_key,
    } | query_access(owner_id))

    if not object:
        raise Exception("""\
the object you're trying to get either \
doesn't exist or you don't have permission \
to get it.""")

    del object["_id"]
    return object

async def tags(db, owner_id):
    async for doc in db.aggregate([
        { "$match": {
            "_by": owner_id,
        }},
        { "$project": {
            "_id": 0,
            "_tags": 1,
        }},
        { "$unwind": {
            "path": "$_tags"
        }},
        { "$group": {
            "_id": None,
            "_tags": { "$addToSet": "$_tags" }
        }}]):

        return doc["_tags"]
    else:
        return []
