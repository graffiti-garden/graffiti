import { inject, computed, unref } from 'vue'
import { fileReferenceValidate } from '@graffiti-garden/graffiti/extensions/files'

addSubType() {
}

function mergeTypes(type1, type2) {
  return {
    validate: example=> type1.validate(example) && type2.validate(example)
    construct: arg=> {}
  }
}

const Note = {
  validate:

}

const Profile = {
  validate: ajv.compile({
    type: "object",
    properties: {
      type: { const: "Profile" },
      describes: { const: actor },
      published: { type: "number" },
      name: { type: "string" },
      summary: { type: "string" },
      url: { type: "string" },
      icon: { FileReference.schema | {
        mime: { pattern: "image/?"}
      },
    }
  }),

  construct({
    name,
    url,
    icon,
    describes,
    summary,
    published
  }, actor) {
    return {
      type: 'Profile',
      describes: describes?? actor,
      published: published?? Date.now(),
      name,
      summary,
      icon, 
      url
    }
  }
}

graffiti.addLinkListener(source, linkType, callback) {
  graffiti.addLinkListener(source, l=> {
    if (type.validate(l)) callback(l)
  })
}

graffiti.postLink(source, linkType, linkArgs, actor) {
  actor = actor ?? gf.me

  const output = linkType.construct(linkArgs, actor)
  if (!type.validate(output)) {
    throw type.validate.errors
  }
  await gf.postLink()
}

const { fileReference, FileType } = FileReference.makeFileType
gf.postTypedLink(fileReference, FileType)
gf.postTypedLink(gf.me, Profile, {
  name: "my name",
  icon: fileReference,
  ...
})

const reference = gf.postTypedLink(FileReference, file)

const Profile = {
  schema: {
  },


    if (!this.validate(output)) {
      throw validate.errors
    }

    graffiti.post(output)
  }
}



const profiles = computed(()=> links.filter(l=>
  l.actor == unref(actor) &&
  Profile.validate(l.target)
))

return profiles.length?
  // If they exist, return the most recent one
  profiles.sort((p1, p2)=> p2.target.published - p1.target.published)[0].target :

  schema: {
  }

export function useProfile(actor) {
  const gf = inject('graffiti')
  const { links: profileLinks } = gf.useLinks(computed(()=> unref(actor) + ':profile'))

  return computed(()=> {
    // Filter the links for...
    const profiles = profileLinks
    .filter(p=>
      // links created by the actor...
      p.actor == unref(actor) &&
      // that are objects...
      typeof p.target == 'object' &&
      // with a profile-like schema...
      // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-profile
      p.target.type == 'Profile' &&
      p.target.describes == unref(actor) &&
      typeof p.target.published == 'number' &&
      typeof p.target.name == 'string' &&
      (!p.target.image || (
        fileReferenceValidate(p.target.image) &&
        p.target.image.mime.startsWith("image")
      ))
    )

    return profiles.length?
      // If they exist, return the most recent one
      profiles.sort((p1, p2)=> p2.target.published - p1.target.published)[0].target :
      // otherwise return an anonymous profile
      { type: 'Profile', describes: unref(actor), name: 'Anonymous', published: 0}
  })
}

// Post a link that matches
export async function postProfile(graffiti, name, imageFile) {
  if (!name) return

  const output = {
    type: 'Profile',
    describes: graffiti.me,
    published: Date.now(),
    name
  }

  if (imageFile) {
    const [imageReference, imageTarget] = await fileLink(imageFile)
    graffiti.postLink(imageReference, imageTarget)
    output.image = imageReference
  }
}

class Profile {
  validate() {}

  post(name, imageFile, )

  callback() {

  }
}