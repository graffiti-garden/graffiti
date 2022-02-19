def query_rewrite(query, user):
    return {
        # The object must match the query
        "object": { "$elemMatch": query },
        # The near misses must NOT match the query
        "near_misses": { "$not": { "$elemMatch": query } },
        # The user must be the author, have access, or access must be open
        "$or": [
            { "object.signed": user },
            { "access": user },
            { "access": None }
        ]
    }
