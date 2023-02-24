from .schema import query_access, parse_object_URL


async def update(db, object, actor):
    # Make sure the actor is logged in
    if not actor:
        raise Exception("you can't modify objects without logging in.")

    # Make sure the object is by the user
    if object['actor'] != actor:
        raise Exception("you can only create objects by yourself.")

    # Make sure the object ID is consistent
    if parse_object_URL(object["id"])[0] != actor:
        raise Exception("object ID is inconsistent with actor.")

    # Insert the new object
    old_object = await db.find_one_and_replace({
        "id": object["id"],
    }, object, upsert=True)

    if old_object:
        return "replaced"
    else:
        return "inserted"

async def remove(db, object_id, actor):
    # Make sure the actor is logged in
    if not actor:
        raise Exception("you can't modify objects without logging in.")

    # Make sure the object ID is consistent
    if parse_object_URL(object_id)[0] != actor:
        raise Exception("object ID is inconsistent with actor.")

    # Set the old tags as deleting
    old_object = await db.find_one_and_delete({
        "id": object_id,
    })

    if not old_object:
        raise Exception("""\
the object you're trying to modify either \
doesn't exist or you don't have permission \
to modify it.""")

    return "removed"

async def get(db, object_id, actor):
    # Look to see if there is an object matching the description
    object = await db.find_one({
        "id": object_id,
    } | query_access(actor))

    if not object:
        raise Exception("""\
the object you're trying to get either \
doesn't exist or you don't have permission \
to get it.""")

    del object["_id"]
    return object

async def tags(db, actor):
    async for doc in db.aggregate([
        { "$match": {
            "actor": actor,
        }},
        { "$project": {
            "_id": 0,
            "tag": 1,
        }},
        { "$unwind": {
            "path": "$tag"
        }},
        { "$group": {
            "_id": None,
            "tag": { "$addToSet": "$tag" }
        }}]):

        return doc["tag"]
    else:
        return []
