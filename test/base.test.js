"use strict";

const fastifyFactory = require("fastify");
const fp = require("fastify-plugin");
const fastifyJwt = require("fastify-jwt");
const t = require("tap");
const fastifyCASL = require("../index");

// Minimal mock of a fastify-mongoose-driver decoration
const mongooseMock = {
  Post: {
    paths: {
      _id: true,
      title: true,
      summary: true,
      content: true,
      author: true,
      comments: true
    }
  },
  DeleteResponse: {
    paths: {
      message: true
    }
  }
};

// Mock of a Post
const mockPost = {
  _id: 1,
  title: "Hello World",
  summary: "This is a brief summary",
  content: "This is the content of the post",
  author: "John Doe",
  comments: ["This is a comment", "This is another comment"]
};

const postPaths = require("./post-paths");

let fastify;

t.beforeEach(async () => {
  if (fastify) await fastify.close();
  fastify = fastifyFactory();
  fastify.register(
    fp(async fastify => fastify.decorate("mongoose", mongooseMock))
  );
  fastify.register(fastifyJwt, {
    secret: "jwt_secret"
  });

  // Sample JWT that returns a token with the type property indicating user type
  fastify.get("/token/:type", async r => ({
    token: fastify.jwt.sign({ type: r.params.type })
  }));

  // Sample JWT that returns a token with the user_type property indicating user type
  fastify.get("/token/:type/verbose", async r => ({
    token: fastify.jwt.sign({ user_type: { is: r.params.type } })
  }));
});

t.test("fastify.casl should exist", async test => {
  test.plan(2);

  const simpleRule = [
    {
      name: "Post",
      actions: {}
    }
  ];

  fastify.register(fastifyCASL, parent => ({
    mongooseSchemas: parent.mongoose,
    assets: simpleRule
  }));

  try {
    await fastify.ready();
    test.ok(fastify.casl);
    test.ok(fastify.casl.constructor.name === "CASL");
  } catch (e) {
    console.log(e);
    test.fail("Fastify threw", e);
  }
});

t.test(
  "should properly allow access if no restrictions are defined",
  async test => {
    // test.plan(2);

    const simpleRule = [
      {
        name: "Post",
        actions: {}
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule
    }));

    fastify.register(postPaths, {
      prefix: "/post"
    });

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      let { payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      });

      console.dir(payload);

      console.log(token);

      // let { statusCode, payload } = await fastify.inject({
      //   method: "GET",
      //   url: "/post/",
      //   headers: {
      //     Authorization: `Bearer ${token}`
      //   }
      // });

      console.log(statusCode);
      console.log(payload);
    } catch (e) {
      console.log(e);
      test.fail("Fastify threw", e);
    }
  }
);

t.end();

t.tearDown(() => fastify.close());

// const testEmail = `${(+new Date()).toString(36).slice(-5)}@example.com`;

// let { statusCode, payload } = await fastify.inject({
//   method: "POST",
//   url: "/",
//   payload: {
//     username: "test",
//     password: "pass",
//     email: testEmail
//   }
// });

// const { username, password, email, _id } = JSON.parse(payload);
// test.strictEqual(statusCode, 200);
// test.strictEqual(username, "test");
// test.strictEqual(password, undefined);
// test.strictEqual(email, testEmail);

// ({ statusCode, payload } = await fastify.inject({
//   method: "PATCH",
//   url: "/",
//   payload: { author: _id, title: "Hello World", content: "foo bar" }
// }));

// const { title, content, author } = JSON.parse(payload);
// test.strictEqual(title, "Hello World");
// test.strictEqual(content, "foo bar");
// test.strictEqual(author, _id);
