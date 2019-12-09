# Fastify plugin adapter for CASL

[![NPM](https://nodei.co/npm/fastify-casl.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/fastify-casl/)

[![CircleCI](https://circleci.com/gh/Inlecom/fastify-casl.svg?style=svg)](https://circleci.com/gh/Inlecom/fastify-casl)

## Installation

```bash
npm i fastify-casl -s
```

## Usage

This plugin relies on the [fastify-jwt](https://github.com/fastify/fastify-jwt) core package to extract a user's role and apply access-control lists on the endpoint the user is interacting with by sanitizing both the input (request body) and the output (return body). The plugin exposes utility methods to attach them to the `preHandler` or `preSerialization` hooks of an endpoint, sanitizing input and output respectively.

By default, the library looks for a `type` attribute being present in the decoded JWT payload that signifies the role of a user. This value can be overriden when declaring the handler.

If a user does not possess the necesssary permissions to conduct the CRUD operation of the endpoint he / she interacts with, an "Insufficient Privileges" error is thrown. The CRUD operations are mapped to the corresponding RESTful methods (C -> POST, R -> GET, U -> PATCH, D -> DELETE).

The configuration object structure can be found below:

```javascript
{
  mongooseSchemas: MONGOOSE_INSTANCE,
  assets: ASSET_RULE_ARRAY,
  denyByDefault: BOOLEAN,
  verbose: BOOLEAN
}
```

The `mongooseSchemas` property accepts a [mongoose] instance to extract all the fields of a specific asset. The inclusion of a mongoose instance is optional, as the internal code of the library simply looks at the `mongooseSchemas[NAME_OF_ASSET].paths` property, but is provided to prevent schema repetition. For instance, the library pairs nicely with [fastify-mongoose-driver](https://github.com/alex-ppg/fastify-mongoose) as one can declare the plugin as follows:

```javascript
fastify.register(
  require("fastify-mongoose-driver").plugin,
  {
    uri: MONGODB_URI,
    settings: MONGOOSE_SETTINGS,
    models: MONGOOSE_MODELS,
    useNameAndAlias: true
  }
);

fastify.register(
  require("fastify-casl"),
  parent => ({
    mongooseSchemas: parent.mongoose,
    assets: ASSET_RULE_ARRAY
  })
);
```

If a permission is inexistent, it is possible to either deny by default or allow by default depending on the `denyByDefault` option passed during plugin registration. This value is set to `false` when omitted so make sure to specify `true` for sensitive applications.

The `verbose` parameter, whose default value is `false`, specifies whether to return the custom `path` that failed when retrieving nested values in f.e. the JWT decoded payload or the response body. This is useful for debugging purposes as the exact path that failed can be viewed in the thrown `Error`. If set to `false`, the `Error` that is thrown simply states `"Fatal Error"`.

The `assets` property of the configuration object contains an `Array` of asset rules. A basic structure of an asset rule is as follows:

```javascript
{
  name: "NAME_OF_ASSET",
  actions: {
    HTTP_ACTION: {
      ROLE: RULE_CONFIGURATION
    }
  }
}
```

As an example, if we have an asset we call `"Post"` which only users with the `writer` role are allowed to `create` and `update`, we can create the following configuration:

```javascript
{
  name: "Post",
  actions: {
    POST: {
      writer: {}
    },
    PATCH: {
      writer: {}
    }
  }
}
```

The `RULE_CONFIGURATION` parameter can provide more fine-grained control with regards to the permissions a role has. It allows one to specify specific fields (`$fields` property) of an asset a role is allowed to conduct the operation as well as conditionals (`$if` property).

The `$fields` property is pretty straightforward. If we wish to allow `editor` users to edit the content of `Post`s but only `writer`s to `create` and `update` them, we can write the following:

```javascript
{
  name: "Post",
  actions: {
    POST: {
      writer: {}
    },
    PATCH: {
      writer: {},
      editor: {
        $fields: ["content"]
      }
    }
  }
}
```

The plugin supports basic and dynamic context-based rules via the `$if` operator. For a basic rule, one may specify the value directly that will be checked via **strict equality**. As an example, if we wish to allow only objects that possess the `_id` 2, we write the following rule:

```javascript
{
  $if: {
    _id: 2
  }
}
```

In dynamic rules, we prefix the attribute we wish to check with the `$` operator, noting that the following string value represents a path inside the decoded JWT payload that the program must traverse to extract the dynamic value to check. For instance, if we wish to ensure that the user ID is equal to the author of an asset that is being returned and our encoded JWT structure contains a `user` object that possesses the `id` value containing that ID, we can construct the following `$if` rule:

```javascript
{
  $if: {
    $author: 'user.id'
  }
}
```

It is also possible to specify multiple rules for a rosle that reveal certain attributes of an object depending on the context. For instance, if we wish to allow all asset attributes to be seen only when the `author` of a post is equal to the user ID and otherwise only show the `title`s, it is possible to do so with the following configuration:

```javascript
{
  $fields: [
    ["title", "author", "summary", "comments", "content"],
    ["title"]
  ],
  $if: [
    {
      $author: 'user.id'
    },
    {}
  ]
}
```

The above filter works even if the returned value is an `Array` of multiple assets and each asset is stripped atomically.

The sanitization operation occurs either before or after a specific endpoint via the `preHandler` or the `preSerialization` hook. As the plugin injects the `CASL` instance under `fastify.casl` after it has been registered, the plugin can only be used in routes registered after the plugin.

The `CASL` class exposes two main function factories, `guardPath` and `sanitizeOutput`. The former is used to guard the input of a path whereas the second sanitizes the output of a path. As a basic example:

```javascript
fastify.post("/", { preHandler: fastify.casl.guardPath() }, pathFunction);
```

The `guardPath` factory takes two arguments. The first is the path of the decoded JWT payload that represents a user role, which by default is `type`, and the second is the asset whose rules should be applied on the path. If no asset name is explicitly given, the library deduces the path by capitalizing the first segment of the full URL path. For example, if we register the following:

```javascript
fastify.post("/post", { preHandler: fastify.casl.guardPath() }, pathFunction);
```

It will automatically deduce that the asset currently concerned is the `Post` asset. As the plugin simply looks for the first URL segment after the domain in the `raw` property of the `request`, it pairs nicely with `prefix` option of `fastify.register` for prefixing routes.

The sanitization operation of `guardPath` is done on the `request.body` of the request.

The `sanitizeOutput` factory takes three arguments. The first is once again the path of the decoded JWT payload that represents a user role defaulting to `type`, the second is the path that contains the asset to be sanitized in the response payload and the third parameter is the explicitly specified asset name. 

The new parameter here allows one to only sanitize a specific portion of a response payload. This is especially useful in contexts when the API response includes a `message` property and a `post` for instance property that contains the actual `Post`. In such a case, we can specify `"post"` as the second argument of the `sanitizeOutput` factory to only sanitize that part of the request. An exemplary usage of the above can be found below:

```javascript
fastify.get(
  "/post",
  { preSerialization: fastify.casl.sanitizeOutput("type", "posts") },
  async () => ({
    message: "Successfully fetched posts",
    posts: ARRAY_OF_POSTS
  })
);
```

The library automatically detects if the provided object to parse is an `Array` or a simple `Object` and sanitizes accordingly.

## Author

[Alex Papageorgiou](alex.papageorgiou@inlecomsystems.com)

## License

Licensed under [GPLv3](./LICENSE).
