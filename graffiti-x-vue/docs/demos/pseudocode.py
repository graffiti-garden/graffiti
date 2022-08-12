for condition in object._inContextIf:

    for mutation in condition._queryFailsWithout:
        if query(mutation(object)):
            break

    for mutation in condition._queryPassesWithout:
        if not query(mutation(object)):
            break

    return True

else:
    return False
