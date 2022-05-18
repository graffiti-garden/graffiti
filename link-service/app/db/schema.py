def socket_schema(owner_id):
    return {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "messageID": { "type": "string" },
    },
    "required": ["messageID", "type"],
    "oneOf": [{
        # UPDATE
        "properties": {
            "type": { "const": "update" },
            "object": object_schema(owner_id)
        },
        "required": ["object"],
    }, {
        # DELETE
        "properties": {
            "type": { "const": "delete" },
            "object_id": { "type": "string" }
        },
        "required": ["object_id"],
    }, {
        # SUBSCRIBE
        "properties": {
            "type": { "const": "subscribe" },
            "query": query_schema(owner_id)
        },
        "required": ["query"],
    }, {
        # UNSUBSCRIBE
        "properties": {
            "type": { "const": "unsubscribe" },
            "query_hash": { "type": "string" }
        },
        "required": ["query_hash"],
    }]
}

def object_schema(owner_id):
    return {
    "type": "object",
    "additionalProperties": False,
    "patternProperties": {
        # Anything not starting with a "_"
        "^(?!_)\w+$": recurse
    },
    "properties": {
        "_by": { "const": owner_id },
        "_timestamp": { "type": "number" },
        "_to": {
            "type": "array",
            "items": {
                "type": "string"
            }
        },
        "_id": { "type": "string" },
        "_contexts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "_nearMisses": {
                        "type": "array",
                        "items": { "type": "object" }
                    },
                    "_neighbors": {
                        "type": "array",
                        "items": { "type": "object" }
                    },
                }
            }
        }
    }
}

def query_schema(owner_id):
    allowed_properties = { '$' + o: recurse for o in allowed_operators }
    allowed_properties['_to'] = { "const": owner_id }
    return {
    "type": "object",
    "additionalProperties": False,
    "patternProperties": {
        # Anything not starting with a "$"
        "^(?!\$)\w+$": recurse
    },
    "properties": allowed_properties
}

allowed_operators = ['eq', 'gt', 'gte', 'in', 'lt', 'lte', 'ne', 'nin', 'and', 'not', 'nor', 'or', 'exists', 'type', 'all', 'elemMatch', 'size', '', 'slice']

recurse = { "oneOf": [
    { "ref": "#" },
    { "type": { "not": "object" } }
]}
