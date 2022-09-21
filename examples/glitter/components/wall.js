export default function({myID, useCollection}) { return {

  setup: ()=> ({
    posts: useCollection({
      post: { $type: 'string' },
      id: { $type: 'string' },
      timestamp: { $type: 'number' },
      'position.x': {
        $type: 'number',
        $gte: 0,
        $lte: 1
      },
      'position.y': {
        $type: 'number',
        $gte: 0,
        $lte: 1
      }
    })
  }),

  data: ()=> ({
    postContent: '',
    creatorOpen: false,
    publicContext: false,
    editPost: null
  }),

  methods: {

    style(post) {
      return {
        left: `${post.position.x*100}%`,
        top: `${post.position.y*100}%`,
        'z-index': Math.round(post.timestamp/1000)
      }
    },

    makePost() {
      const post = {
        post: this.postContent,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        position: {
          x: Math.random(),
          y: Math.random()
        }
      }
      if (!this.publicContext) {
        post._inContextIf = [{
          _queryFailsWithout: ['position.x', 'position.y']
        }]
      }
      this.posts.update(post)
      this.postContent = ''
      this.creatorOpen = false
    },

    startDrag(event, post) {
      event.dataTransfer.dropEffect = 'move'
      event.dataTransfer.effectAllowed = 'move'
      this.dragging = post
    },

    endDrag(event) {
      this.dragging.position.x = 
        event.clientX/document.documentElement.clientWidth
      this.dragging.position.y = 
        event.clientY/document.documentElement.clientHeight
      this.dragging._update()
    }
  },

  template: `
    <header>
      <button @click="creatorOpen=true">
        make new post
      </button>
    </header>
    <dialog v-if="creatorOpen||editPost">
      <form v-if="creatorOpen" @submit.prevent="makePost" v-click-away="()=>creatorOpen=false">
        <textarea v-model="postContent"/>
        <label>
          <input type="checkbox" v-model="publicContext">
          share this post with more generic posters (like namebook)?
        </label>
        <input type="submit" value="send it">
      </form>
      <form v-if="editPost" v-click-away="()=>editPost=null">
        <button @click="editPost._remove();editPost=null">
          ❌ delete post ❌
        </button>
        <label>
          <input type="checkbox" v-model="publicContext">
          share this post with more generic posters (like namebook)?
        </label>
      </form>
    </dialog>
    <main @drop="endDrag($event)" @dragover.prevent @dragenter.prevent>
      <ul>
        <li v-for="post in posts" :style="style(post)" :draggable="post._by=='${myID}'" @dragstart="startDrag($event, post)" @dblclick="editPost=post">
          {{post.post}}
        </li>
      </ul>
    </main>`
}}
