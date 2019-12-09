// Ensure id is parsed as a number
const idParamSchema = {
  params: { type: "object", properties: { id: { type: "number" } } }
};

// Mock CRUD paths for a Post
const routes = async fastify => {
  let serverPosts = [
    {
      _id: 2,
      title: "Foo Bar",
      summary: "Summary of post no. 2",
      content: "Content of post no. 2",
      author: "Jane Doe",
      comments: ["Lorem", "Ipsum"]
    },
    {
      _id: 3,
      title: "Bar Foo",
      summary: "Summary of post no. 3",
      content: "Content of post no. 3",
      author: "John Doe",
      comments: ["Lorem", "Ipsum"]
    }
  ];

  const getIndex = id => serverPosts.findIndex(post => post._id === id);

  // Return Array
  fastify.get(
    "/",
    {
      preHandler: fastify.casl.guardPath(),
      preSerialization: fastify.casl.sanitizeOutput()
    },
    async () => serverPosts
  );

  // Return Nested Array
  fastify.get(
    "/nested",
    {
      preSerialization: fastify.casl.sanitizeOutput("type", "posts.nested")
    },
    async () => ({
      posts: { nested: serverPosts }
    })
  );

  // Throw on serialization nest
  fastify.get(
    "/throw",
    {
      preSerialization: fastify.casl.sanitizeOutput(
        "type",
        "posts.nested.inner"
      )
    },
    async () => serverPosts
  );

  // Return object
  fastify.post(
    "/",
    {
      preHandler: fastify.casl.guardPath("type", "Post")
    },
    async r => {
      serverPosts.push(r.body);
      return r.body;
    }
  );

  // Return object with custom user type path
  fastify.get(
    "/:id",
    {
      preSerialization: fastify.casl.sanitizeOutput("user_type.is"),
      schema: idParamSchema
    },
    async r => serverPosts.find(post => post._id === r.params.id)
  );

  // Return nested object
  fastify.patch(
    "/:id",
    {
      preSerialization: fastify.casl.sanitizeOutput("type", "post.nested"),
      schema: idParamSchema
    },
    async r => {
      const assetIndex = getIndex(r.params.id);

      serverPosts[assetIndex] = {
        ...serverPosts[assetIndex],
        ...r.body
      };

      return {
        message: "Updated Successfully",
        post: {
          nested: serverPosts[assetIndex]
        }
      };
    }
  );

  // Return explicitly referred object
  fastify.delete(
    "/:id",
    {
      preSerialization: fastify.casl.sanitizeOutput(
        "type",
        undefined,
        "DeleteResponse"
      ),
      schema: idParamSchema
    },
    async r => {
      delete serverPosts[getIndex(r.params.id)];

      return {
        message: "Successfully deleted post",
        should: "not show"
      };
    }
  );
};

module.exports = routes;
