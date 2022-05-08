allowed_operators = {'eq', 'gt', 'gte', 'in', 'lt', 'lte', 'ne', 'nin', 'and', 'not', 'nor', 'or', 'exists', 'type', 'all', 'elemMatch', 'size', '', 'slice'}

def query_rewrite(query, owner_id):
    for k, v in json_iterator(query):

        # Make sure only allowed operators are used
        if k.startswith('$'):
            if k[:1] not in allowed_operators:
                raise Exception(f"{k} is not an allowed query operator")

        # And ~to fields can't be forged
        elif k == '~to' and v != owner_id:
            raise Exception("you can only query for objects ~to yourself")

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

def object_rewrite(object, contexts, owner_id):
    for k in object:

        # Make sure timestamps are numbers
        if k == '~timestamp':
            if not (isinstance(object[k], int) or isinstance(object[k], float)):
                raise Exception("~timestamp must be a number")

        # Make sure the by field can't be forged
        elif k == '~by':
            if object[k] != owner_id:
                raise Exception("you can only update objects ~by yourself")

        # Make sure the to field is a list of strings
        elif k == '~to':
            if not isinstance(object[k], list):
                raise Exception("~to must be a list of ids")
            for v in object[k]:
                if not isinstance(v, str):
                    raise Exception(f"~to contains an invalid id, {v}")

        # The id must be a string
        elif k == '~id':
            if not isinstance(object[k], str):
                raise Exception("~id must be a string")

        else:
            if k.startswith('~'):
                raise Exception("~ is reserved for graffiti fields")
            for k_ in json_iterator(object[k]):
                if k_.startswith('~'):
                    raise Exception("~ is reserved for graffiti fields at the root level")

    # If there is no id or timestamp, generate it
    if '~id' not in object:
        object['~id'] = str(uuid4())
    if '~timestamp' not in object:
        object['~timestamp'] = int(time.time() * 1000)

    # Combine it into one big document
    return {
        "owner_id": owner_id,
        "object": [object],
        "contexts": contexts,
    }

def json_iterator(x):
    if isinstance(x, dict):
        for k, v in x.items():
            for k_, v_ in json_iterator(v):
                yield k_, v_
            yield k, v
    elif isinstance(x, list):
        for y in x:
            for k, v in json_iterator(y):
                yield k, v
