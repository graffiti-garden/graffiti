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
      this.posts.update({
        post: this.postContent,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        position: {
          x: Math.random(),
          y: Math.random()
        }
      })
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
    <dialog v-if="creatorOpen">
      <form @submit.prevent="makePost">
        <textarea v-model="postContent"/>
        <input type="submit" value="send it">
      </form>
    </dialog>
    <main @drop="endDrag($event)" @dragover.prevent @dragenter.prevent>
      <ul>
        <li v-for="post in posts" :style="style(post)" :draggable="post._by=='${myID}'" @dragstart="startDrag($event, post)">
          {{post.post}}
        </li>
      </ul>
    </main>`
}}
