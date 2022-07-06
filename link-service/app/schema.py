import re
import json
import jsonschema
from jsonschema.exceptions import ValidationError

# Hex representation of sha256
SHA256_PATTERN = "[0-9a-f]{64}" # regex
SHA256_SCHEMA = { # jsonschema
    "type": "string",
    "pattern": f"^{SHA256_PATTERN}$"
}

# Random user input - any reasonably sized string
RANDOM_SCHEMA = { # jsonschema
    "type": "string",
    "pattern": "^.{1,64}$"
}

# Mongo Operators
QUERY_PROPERTY_SCHEMA = { # jsonschema
    "_to": SHA256_SCHEMA,
    "$elemMatch": { "$ref": "#/definitions/query" },
    "$type": {
        "type": "string",
        "enum": ["int", "long", "double", "decimal", "number", "string", "object", "array", "bool", "null"]
    },
    "$exists": { "type": "boolean" },
    "$size":   { "type": "integer" }
} | {
    '$' + o: {
        "type": "array",
        "items": { "$ref": "#/definitions/query" }
    } for o in ["and", "not", "nor", "or"]
} | {
    '$' + o: {
        "$ref": "#/definitions/objectValues"
    } for o in ["eq", "ne"]
} | {
    '$' + o: {
        "type": "array",
        "items": { "$ref": "#/definitions/objectValues" }
    } for o in ["in", "nin", "all"]
} | {
    '$' + o: { "type": ["boolean", "number", "null"] }
    for o in ["gt", "gte", "lt", "lte"]
}

QUERY_OWNER_PATTERN  = re.compile(f'"_to": "({SHA256_PATTERN})"')

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
                # Anything not starting with a "_" or a "$"
                "^(?!_|\$).*$": { "$ref": "#/definitions/objectValues" }
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
        "objectValues": { "oneOf": [
            { "type": "object",
                "additionalProperties": False,
                "patternProperties": {
                    "^(?!_|\$).*$": { "$ref": "#/definitions/objectValues" }
                }
            },
            { "type": "array",
                "items": { "$ref": "#/definitions/objectValues" }
            },
            { "type": ["string", "number", "boolean", "null"] }
        ]},
        "query": {
            "type": "object",
            "additionalProperties": False,
            "patternProperties": {
                # Anything not starting with a "$"
                "^(?!\$).*$": { "oneOf": [
                    { "$ref": "#/definitions/query" },
                    { "type": "array",
                        "items": { "$ref": "#/definitions/query" }
                    },
                    { "type": ["string", "number", "boolean", "null"] }
                ] }
            },
            "properties": QUERY_PROPERTY_SCHEMA
        },
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
