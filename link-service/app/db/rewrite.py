from fastapi import HTTPException

def query_rewrite(query, owner_id):
    # If the query includes a $to field anywhere,
    # make sure that it is equal to the owner_id
    if owner_id:
        assert_key_has_value(object, '$to', owner_id,
            "You can't make a query with a '$to' field that is not equal to your ID.")

    return {
        # The object must match the query
        "object": { "$elemMatch": query },
        "$or": [
            # Either there are no contexts
            { "contexts": { "$size": 0 } },
            # Or the object must match at least one of the contexts
            { "contexts": { "$elemMatch": {
                # None of the near misses can match the query
                "nearMisses": {
                    "$not": { "$elemMatch": query }
                },
                # All of the neighbors must match the query
                "neighbors": {
                    "$not": {
                        # Which is the negation of:
                        # "some neighbor does not match the query"
                        "$elemMatch": { "$nor": [ query ] }
                    }
                }
            }}}
        ]
    }

def personal_query_rewrite(query, owner_id):
    return {
        "object": { "$elemMatch": query },
        "owner_id": owner_id
    }

def object_rewrite(object, contexts, owner_id):
    # If the object includes a $by field anywhere,
    # make sure it is equal to the owner_id
    assert_key_has_value(object, '$by', owner_id,
        "You can't update an object with a '$by' field that is not equal to your ID.")

    # Combine it into one big document
    return {
        "owner_id": owner_id,
        "object": [object],
        "contexts": contexts,
    }

def assert_key_has_value(x, key, value, error_msg):
    if isinstance(x, dict):
        for k in x:
            if k == key and x[k] != value:
                raise HTTPException(status_code=401, detail=error_msg)
            else:
                assert_key_has_value(x[k], key, value, error_msg)
    elif isinstance(x, list):
        for y in x:
            assert_key_has_value(y, key, value, error_msg)
