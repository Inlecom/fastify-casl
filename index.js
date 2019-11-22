"use strict";

const fastifyPlugin = require("fastify-plugin");
const { AbilityBuilder, Ability } = require("@casl/ability");

// RESTful Aliases
Ability.addAlias("POST", "create");
Ability.addAlias("GET", "read");
Ability.addAlias("PATCH", "update");
Ability.addAlias("DELETE", "delete");

const { permittedFieldsOf } = require("@casl/ability/extra");
const pick = require("lodash/pick");

class CASL {
  constructor(mongoose, assets, denyByDefault = false) {
    this.denyByDefault = denyByDefault;

    assets.forEach(({ name, actions }) => {
      Object.keys(actions).map(action => {
        Object.keys(actions[action]).forEach(user => {
          if (
            actions[action][user] === null ||
            (typeof actions[action][user] !== "boolean" &&
              typeof actions[action][user] !== "object")
          )
            throw new Error("Invalid user rights provided");

          //   const rule = {action,name};
          const rule = {};
          // If true, all variables below will be undefined
          const { $if, $fields } = actions[action][user];

          if (Array.isArray($fields)) rule.$fields = $fields;
          if ($if !== null && typeof $if === "object") {
            const $dynamicFields = Object.keys($if).filter(
              key => key[0] === "$"
            );
            rule.$if = { $dynamicFields, ...$if };
          }

          actions[action][user] = rule;
        });
      });

      this[name] = {
        ...actions,
        $allFields: Object.keys(mongoose[name].paths)
      };
    });
  }

  sanitizeOutput(userField = "type", path = undefined, asset = undefined) {
    return async (r, _, payload) => {
      const allowedFields = await this.getAllowedFields(r, userField, asset);

      if (path !== undefined) payload = this.getNestedValue(payload, path);

      return Array.isArray(payload)
        ? payload.map(member => pick(member, allowedFields))
        : pick(payload, allowedFields);
    };
  }

  guardPath(userField = "type", asset = undefined) {
    return async r => {
      const allowedFields = await this.getAllowedFields(r, userField, asset);

      if (typeof r.body === "object") r.body = pick(r.body, allowedFields);
    };
  }

  async getAllowedFields(r, userField, asset) {
    console.log(r.jwtVerify);
    const { raw, jwtVerify } = r;
    console.log(raw);
    // const {
    //   raw: { url, method },
    //   jwtVerify
    // } = r;

    if (!asset)
      asset = url[0].toUpperCase() + url.substring(1, url.indexOf(1, "/"));

    const user = await jwtVerify();

    const ability = this.createAbilities(asset, method, user[userField], user);

    const allAssetFields = this[asset].$allFields;

    return permittedFieldsOf(ability, method, asset, {
      fieldsFrom: rule => rule.fields || allAssetFields
    });
  }

  createAbilities(asset, action, userType, userInfo) {
    return AbilityBuilder.define(can => {
      if (this[asset][action] && this[asset][action][userType]) {
        let { $if, $fields } = this[asset][action][userType];
        const rule = [action, asset];

        if ($fields) rule.push($fields);

        $if = { ...$if };

        if ($if) {
          if ($if.$dynamicFields) {
            $if.$dynamicFields.forEach(
              field => ($if[field] = getNestedValue(userInfo, $if[field]))
            );
            delete $if.$dynamicFields;
          }

          rule.push($if);
        }

        can(...rule);
      } else {
        if (this.denyByDefault) throw new Error("Insufficient Privileges");
        can("crud", "all");
      }
    });
  }

  getNestedValue(obj, path) {
    path
      .split(".")
      .forEach(segment => (obj = obj !== undefined ? obj[segment] : undefined));

    return obj;
  }
}

async function caslConnector(
  fastify,
  { assets, mongooseSchemas, denyByDefault = false }
) {
  fastify.decorate("casl", new CASL(mongooseSchemas, assets, denyByDefault));
}

module.exports = fastifyPlugin(caslConnector);
