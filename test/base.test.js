"use strict";

const fastifyFactory = require("fastify");
const fp = require("fastify-plugin");
const fastifyJwt = require("fastify-jwt");
const t = require("tap");
const fastifyCASL = require("../index");
const pick = require("lodash/pick");

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
    token: fastify.jwt.sign({ type: r.params.type, nested: { value: 3 } })
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
    test.fail("Fastify threw", e);
  }
});

t.test(
  "should properly allow access if no restrictions are defined",
  async test => {
    test.plan(4);

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

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), [
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
      ]);
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly disallow access if no restrictions are defined & denyByDefault is set to true",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {}
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 500);
      test.deepEqual(JSON.parse(payload), {
        statusCode: 500,
        error: "Internal Server Error",
        message: "Insufficient Privileges"
      });
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly allow access to authorized members w/ denyByDefault",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          GET: {
            writer: {}
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), [
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
      ]);
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly allow access to authorized members on designated fields",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          GET: {
            writer: {
              $fields: ["title", "author", "content"]
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), [
        {
          title: "Foo Bar",
          content: "Content of post no. 2",
          author: "Jane Doe"
        },
        {
          title: "Bar Foo",
          content: "Content of post no. 3",
          author: "John Doe"
        }
      ]);
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly allow access to authorized members based on conditional statements on the asset",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          GET: {
            writer: {
              $fields: ["title", "author", "content"],
              $if: {
                _id: 2
              }
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), [
        {
          title: "Foo Bar",
          content: "Content of post no. 2",
          author: "Jane Doe"
        }
      ]);
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly allow access to authorized members based on multiple conditional statements on the asset",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          GET: {
            writer: {
              $fields: [
                ["title", "author", "content"],
                ["title", "comments", "summary"]
              ],
              $if: [
                {
                  _id: 2
                },
                {
                  _id: 3
                }
              ]
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), [
        {
          title: "Foo Bar",
          content: "Content of post no. 2",
          author: "Jane Doe"
        },
        {
          title: "Bar Foo",
          summary: "Summary of post no. 3",
          comments: ["Lorem", "Ipsum"]
        }
      ]);
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly allow access to authorized members based on dynamic conditional statements on the asset & the user",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          GET: {
            writer: {
              $fields: ["_id", "title", "author", "content"],
              $if: {
                $_id: "nested.value"
              }
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), [
        {
          _id: 3,
          title: "Bar Foo",
          content: "Content of post no. 3",
          author: "John Doe"
        }
      ]);
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly sanitize input of authorized members in request.body",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          POST: {
            writer: {
              $fields: ["_id", "title", "author", "content"]
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "POST",
        url: "/post/",
        body: mockPost,
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(
        JSON.parse(payload),
        pick(mockPost, ["_id", "title", "author", "content"])
      );
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly sanitize output for authorized members in nested property of return structure",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          PATCH: {
            writer: {
              $fields: ["title", "author", "content"]
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "PATCH",
        url: "/post/2",
        body: {
          title: "Test"
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), {
        title: "Test",
        author: "Jane Doe",
        content: "Content of post no. 2"
      });
    } catch (e) {
      test.fail("Fastify threw", e);
    }
  }
);

t.test(
  "should properly test for a nested property in the jwt payload as the user type",
  async test => {
    test.plan(4);

    const simpleRule = [
      {
        name: "Post",
        actions: {
          GET: {
            writer: {
              $fields: ["title", "author", "content"],
              $if: {}
            }
          }
        }
      }
    ];

    fastify.register(fastifyCASL, parent => ({
      mongooseSchemas: parent.mongoose,
      assets: simpleRule,
      denyByDefault: true
    }));

    // Sample CRUD RESTful paths for a mock /post endpoint
    fastify.register(postPaths, {
      prefix: "/post"
    });

    let payload, statusCode;

    try {
      await fastify.ready();
      test.ok(fastify.casl);
      test.ok(fastify.casl.constructor.name === "CASL");

      ({ payload } = await fastify.inject({
        method: "GET",
        url: "/token/writer/verbose"
      }));

      const { token } = JSON.parse(payload);

      ({ statusCode, payload } = await fastify.inject({
        method: "GET",
        url: "/post/3",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }));

      test.equal(statusCode, 200);
      test.deepEqual(JSON.parse(payload), {
        title: "Bar Foo",
        author: "Jane Doe",
        content: "Content of post no. 2"
      });
    } catch (e) {
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
