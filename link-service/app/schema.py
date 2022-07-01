import re
import json
import jsonschema
from jsonschema.exceptions import ValidationError

# Mongo Operators
ALLOWED_QUERY_OPERATORS = ['eq', 'gt', 'gte', 'in', 'lt', 'lte', 'ne', 'nin', 'and', 'not', 'nor', 'or', 'exists', 'type', 'all', 'elemMatch', 'size', '', 'slice']

# Hex representation of sha256
SHA256_PATTERN = "[0-9a-f]{64}"
SHA256_SCHEMA = {
    "type": "string",
    "pattern": f"^{SHA256_PATTERN}$"
}

# Random user input - any reasonably sized string
RANDOM_SCHEMA = {
    "type": "string",
    "pattern": "^.{1,64}$"
}

QUERY_OWNER_PATTERN  = re.compile(f'"_to": "({SHA256_PATTERN})"')

def allowed_query_properties():
    allowed_properties = { '$' + o: { "$ref": "#/definitions/queryProp" } for o in ALLOWED_QUERY_OPERATORS }
    allowed_properties['_to'] = SHA256_SCHEMA
    return allowed_properties

BASE_TYPES = ["messageID", "type"]

def socket_schema():
    return {
    "type": "object",
    "oneOf": [{
        # UPDATE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "update" },
            "object": { "$ref": "#/definitions/object" },
        },
        "required": BASE_TYPES + ["object"],
        "additionalProperties": False
    }, {
        # DELETE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "delete" },
            "objectID": SHA256_SCHEMA
        },
        "required": BASE_TYPES + ["objectID"],
        "additionalProperties": False
    }, {
        # SUBSCRIBE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "subscribe" },
            "query": { "$ref": "#/definitions/query" },
            "since": { "oneOf": [{
                    "type": "string",
                    # A mongo object ID
                    "pattern": "^([a-f\d]{24})$"
                }, { "type": "null" }]
            },
            "queryID": RANDOM_SCHEMA
        },
        "required": BASE_TYPES + ["query", "since", "queryID"],
        "additionalProperties": False
    }, {
        # UNSUBSCRIBE
        "properties": {
            "messageID": RANDOM_SCHEMA,
            "type": { "const": "unsubscribe" },
            "queryID": RANDOM_SCHEMA
        },
        "required": BASE_TYPES + ["queryID"],
        "additionalProperties": False
    }],
    "definitions": {
        "object": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                # Anything not starting with a "_"
                "^(?!_).*$": True
            },
            "required": ["_idProof", "_id", "_to", "_by", "_contexts"],
            "properties": {
                "_by": SHA256_SCHEMA,
                "_to": {
                    "type": "array",
                    "items": SHA256_SCHEMA
                },
                "_id": SHA256_SCHEMA,
                "_idProof": RANDOM_SCHEMA,
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
        "queryProp": { "oneOf": [
            # Either a root object type
            { "$ref": "#/definitions/query" },
            # A recursive array
            { "type": "array",
                "items": { "$ref": "#/definitions/queryProp" }
            },
            # Or something a constant
            { "type": "string" },
            { "type": "number" },
            { "type": "boolean" },
            { "type": "null" }
        ]}
    }
}

# Initialize the schema validator
VALIDATOR = jsonschema.Draft7Validator(socket_schema())

def validate(msg, owner_id):
    VALIDATOR.validate(msg)

    if msg['type'] == 'update':
        if msg['object']['_by'] != owner_id:
            raise ValidationError("you can only create objects _by yourself")
        if owner_id not in msg['object']['_to']:
            raise ValidationError("you must make all objects _to yourself")
    elif msg['type'] == 'subscribe':
        matches = QUERY_OWNER_PATTERN.findall(json.dumps(msg))
        for match in matches:
            if match != owner_id:
                raise ValidationError("you can only query for objects _to yourself")
