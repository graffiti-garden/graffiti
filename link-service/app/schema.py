import re
import json
import jsonschema
from jsonschema.exceptions import ValidationError

# Mongo Operators
ALLOWED_QUERY_OPERATORS = ['eq', 'gt', 'gte', 'in', 'lt', 'lte', 'ne', 'nin', 'and', 'not', 'nor', 'or', 'exists', 'type', 'all', 'elemMatch', 'size', '', 'slice']

UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

UUID_SCHEMA = {
    "type": "string",
    "pattern": f"^{UUID_PATTERN}$"
}

OBJECT_OWNER_PATTERN = re.compile(f'"_by": "({UUID_PATTERN})"')
QUERY_OWNER_PATTERN  = re.compile(f'"_to": "({UUID_PATTERN})"')

def allowed_query_properties():
    allowed_properties = { '$' + o: { "$ref": "#/definitions/queryProp" } for o in ALLOWED_QUERY_OPERATORS }
    allowed_properties['_to'] = UUID_SCHEMA
    return allowed_properties

def recursive_property(name):
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

def socket_schema():
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
            "objectID": UUID_SCHEMA
        },
        "required": ["objectID"],
    }, {
        # SUBSCRIBE
        "properties": {
            "type": { "const": "subscribe" },
            "query": { "$ref": "#/definitions/query" },
            "since": { "type": "string" }
        },
        "required": ["query"],
    }, {
        # UNSUBSCRIBE
        "properties": {
            "type": { "const": "unsubscribe" },
            "queryID": UUID_SCHEMA
        },
        "required": ["queryID"],
    }],
    "definitions": {
        "object": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                # Anything not starting with a "_"
                "^(?!_).*$": { "$ref": "#/definitions/objectProp" }
            },
            "properties": {
                "_by": UUID_SCHEMA,
                "_timestamp": { "type": "number" },
                "_to": {
                    "type": "array",
                    "items": UUID_SCHEMA
                },
                "_id": UUID_SCHEMA,
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
                "^(?!\$).*$": { "$ref": "#/definitions/queryProp" }
            },
            "properties": allowed_query_properties()
        },
        "objectProp": recursive_property("object"),
        "queryProp": recursive_property("query")
    }
}

# Initialize the schema validator
VALIDATOR = jsonschema.Draft7Validator(socket_schema())

def validate(msg, owner_id):
    VALIDATOR.validate(msg)

    if msg['type'] == 'update':
        matches = OBJECT_OWNER_PATTERN.findall(json.dumps(msg))
        for match in matches:
            if match != owner_id:
                raise ValidationError("you can only create objects _by yourself")
    elif msg['type'] == 'subscribe':
        matches = QUERY_OWNER_PATTERN.findall(json.dumps(msg))
        for match in matches:
            if match != owner_id:
                raise ValidationError("you can only query for objects _to yourself")
