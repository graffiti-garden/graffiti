def socket_schema(owner_id):
    return {
    "type": "object",
    "properties": {
        "messageID": { "type": "string" },
    },
    "required": ["messageID", "type"],
    "anyOf": [{
        # UPDATE
        "properties": {
            "type": { "const": "update" },
            "object": { "$ref": "#/definitions/object" }
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
            "object": { "$ref": "#/definitions/query" }
        },
        "required": ["query"],
    }, {
        # UNSUBSCRIBE
        "properties": {
            "type": { "const": "unsubscribe" },
            "query_hash": { "type": "string" }
        },
        "required": ["query_hash"],
    }],
    "definitions": {
        "object": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                # Anything not starting with a "_"
                "^(?!_)\w+$": { "$ref": "#/definitions/objectProp" }
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
        },
        "query": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                # Anything not starting with a "$"
                "^(?!\$)\w+$": { "$ref": "#/definitions/queryProp" }
            },
            "properties": allowed_query_properties(owner_id)
        },
        "objectProp": recursive_prop("object"),
        "queryProp": recursive_prop("query")
    }
}

allowed_query_operators = ['eq', 'gt', 'gte', 'in', 'lt', 'lte', 'ne', 'nin', 'and', 'not', 'nor', 'or', 'exists', 'type', 'all', 'elemMatch', 'size', '', 'slice']

def allowed_query_properties(owner_id):
    allowed_properties = { '$' + o: { "$ref": "#/definitions/queryProp" } for o in allowed_query_operators }
    allowed_properties['_to'] = { "const": owner_id }
    return allowed_properties

def recursive_prop(name):
    return { "oneOf": [
    # Either a root object type
    { "$ref": f"#/definitions/{name}" },
    # A recursive array
    { "type": "array",
        "items": { "$ref": f"#/definitions/{name}Prop" }
    },
    # Or something a constant
    { "type": "string" },
    { "type": "number" },
    { "type": "integer" },
    { "type": "boolean" },
    { "type": "null" }
]}
