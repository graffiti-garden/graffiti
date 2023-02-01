from jsonschema import Draft7Validator

schema = {
    "type": "object",
    "properties": {
        "messageID": { "$ref": "#/definitions/objectKey" },
        "update": { "$ref": "#/definitions/object" },
        "remove": { "$ref": "#/definitions/objectKey" },
        "subscribe": { "$ref": "#/definitions/tags" },
        "unsubscribe": { "$ref": "#/definitions/tags" },
        "get": { "$ref": "#/definitions/userIDAndObjectKey" },
        "ls": { "type": "null" }
    },
    "additionalProperties": False,
    "oneOf": [
        { "required": ["messageID", x] } for x in \
        ["update", "remove", "subscribe", "unsubscribe", "get", "ls"]
    ],
    "definitions": {
        "object": {
            "type": "object",
            "properties": {
                "_by": { "$ref": "#/definitions/userID" },
                "_key": { "$ref": "#/definitions/objectKey" },
                "_tags": { "$ref": "#/definitions/tags" },
                "_to": {
                    "uniqueItems": True,
                    "type": "array",
                    "items": { "$ref": "#/definitions/userID" },
                },
            },
            "patternProperties": {
                # Anything not starting with an underscore is OK
                "^(?!_).*$": True
            },
            "required": ["_key", "_by", "_tags"],
            "additionalProperties": False
        },
        "userID": {
            # A SHA256 String
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
        },
        "objectKey": {
            # Unstructured user input - any reasonably sized string
            "type": "string",
            "pattern": "^.{1,64}$"
        },
        "tags": {
            "type": "array",
            "uniqueItems": True,
            "minItems": 1,
            "items": { "type": "string" }
        },
        "userIDAndObjectKey": {
            "type": "object",
            "properties": {
                "_by": { "$ref": "#/definitions/userID" },
                "_key": { "$ref": "#/definitions/objectKey" },
            },
            "additionalProperties": False,
            "required": ["_key", "_by"]
        }
    }
}

validator = Draft7Validator(schema)
validate = lambda msg: validator.validate(msg)

def query_access(owner_id):
    return { "$or": [
        {
            # The object is public
            "_to": { "$exists": False },
        }, {
            # The object is private
            "_to": { "$exists": True },
            # The owner is the recipient or sender
            "$or": [
                { "_to": owner_id },
                { "_by": owner_id }
            ]
        }
    ]}
