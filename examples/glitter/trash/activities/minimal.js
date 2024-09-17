import Post from './post.js'

export default function({myID, useCollection}) { return {

  setup: ()=> {
    const daysSince = Vue.ref(1)

    const follows = useCollection({
      "follow.by": { $type: 'string' },
      _by: myID
    })

    const posts = useCollection(()=> {
      const followAuthors = follows.value.map(f=>f.follow.by)

      return {
        post: { $type: 'string' },
        id: { $type: 'string' },
        timestamp: { $gt: Date.now() - daysSince.value*24*60*60*1000 },
        $or: [
          { _by: { $in: followAuthors } },
          {  at: { $in: followAuthors } }
        ]
      }
    })

    return { daysSince, follows, posts }
  },

  mounted() {
    window.addEventListener('keyup', (event)=>{
      switch(event.key) {
        case "ArrowLeft":
          this.currentPost=Math.max(this.currentPost-1,0)
          break
        case "ArrowRight":
          this.currentPost=Math.min(this.currentPost+1,this.posts.length-1)
      }
    }, null);
  },

  components: {
    Post: Post(...arguments)
  },

  data: ()=> ({
    sort: 'chron',
    currentPost: 0
  }),

  template: `
    <header>
      <form>
        <p>
          Display posts from the past <input type="number" v-model="daysSince"> days.
        </p>
        <fieldset>
          <legend>
            Sort:
          </legend>
          <label>
            <input type="radio" value="chron" v-model="sort">
            Chronological
          </label>
          <label>
            <input type="radio" value="likes" v-model="sort">
            Most Popular
          </label>
        </fieldset>
      </form>
    </header>
    <main>
      <menu>
        <button :disabled="currentPost<=0" @click="currentPost--">
          ←
        </button>
        {{currentPost+1}}/{{posts.length}}
        <button :disabled="currentPost>=posts.length-1" @click="currentPost++">
          →
        </button>
      </menu>
      <div class="post" v-if="posts.length">
        <Post :post="posts[currentPost]" :showLikeCount="false" :showComments="false"/>
      </div>
      <div class="post" v-else>
        no posts! 😌
      </div>
    </main>`
}}
