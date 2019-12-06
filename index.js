"use strict";

const fastifyPlugin = require("fastify-plugin");
const { AbilityBuilder, Ability } = require("@casl/ability");

// RESTful Aliases
Ability.addAlias("POST", "create");
Ability.addAlias("GET", "read");
Ability.addAlias("PATCH", "update");
Ability.addAlias("DELETE", "delete");

const { permittedFieldsOf } = require("@casl/ability/extra");
// Retrieves the values from the 1st object argument based on the keys provided on the 2nd string array argument
const pick = require("lodash/pick");

class CASL {
  assetClasses = {};

  constructor(mongoose, assets, denyByDefault = false) {
    this.denyByDefault = denyByDefault;

    assets.forEach(({ name, actions }) => {
      // Define class with dynamic name for casl checking
      this.assetClasses[name] = class {
        static get modelName() {
          return name;
        }

        constructor(obj) {
          Object.assign(this, obj);
        }
      };

      // For each action (GET, POST etc.)
      Object.keys(actions).map(action => {
        // For each user described in action (writer, admin etc.)
        Object.keys(actions[action]).forEach(user => {
          if (
            actions[action][user] === null ||
            (typeof actions[action][user] !== "boolean" &&
              typeof actions[action][user] !== "object")
          )
            throw new Error("Invalid user rights provided");

          const rule = {};

          // If the value is true, the destructuring will result in undefined values for $if & $fields ensuring no type of rule checking
          const { $if, $fields } = actions[action][user];

          if (Array.isArray($fields)) rule.$fields = $fields;

          if ($if !== null && typeof $if === "object") {
            rule.$if = $if;
          }

          actions[action][user] = rule;
        });
      });

      // We also need $allFields to ensure that if no rules are specified, all fields are to be retrieved
      this[name] = {
        ...actions,
        $allFields: Object.keys(mongoose[name].paths)
      };
    });
  }

  sanitizeOutput(userField = "type", path = undefined, asset = undefined) {
    return async (r, _, payload) => {
      const {
        raw: { url }
      } = r;

      if (!asset)
        asset = url[1].toUpperCase() + url.substring(2, url.indexOf("/", 1));

      const assetClass = this.assetClasses[asset];

      let assetField;

      if (path !== undefined) assetField = this.getNestedValue(payload, path);
      else assetField = { ...payload };

      if (Array.isArray(assetField)) {
        assetField = assetField.map(async member => {
          const allowedFields = await this.getAllowedFields(
            r,
            userField,
            new assetClass(member)
          );
          return pick(member, allowedFields);
        });
        return (await Promise.all(assetField)).filter(
          obj => Object.entries(obj).length !== 0
        );
      } else {
        const allowedFields = await this.getAllowedFields(
          r,
          userField,
          new assetClass(assetField)
        );

        console.log(allowedFields);

        console.log(pick(assetField, allowedFields));

        return pick(assetField, allowedFields);
      }
    };
  }

  guardPath(userField = "type", asset = undefined) {
    return async r => {
      const {
        raw: { url }
      } = r;

      if (!asset)
        asset = url[1].toUpperCase() + url.substring(2, url.indexOf("/", 1));

      if (typeof r.body === "object") {
        const allowedFields = await this.getAllowedFields(
          r,
          userField,
          new this.assetClasses[asset](r.body)
        );
        r.body = pick(r.body, allowedFields);
      }
    };
  }

  async getAllowedFields(r, userField, asset) {
    const {
      raw: { method }
    } = r;

    const user = await r.jwtVerify();

    const assetName =
      typeof asset === "string" ? asset : asset.constructor.modelName;

    const ability = this.createAbilities(
      assetName,
      method,
      this.getNestedValue(user, userField),
      user
    );

    const allAssetFields = this[assetName].$allFields;

    return permittedFieldsOf(ability, method, asset, {
      fieldsFrom: rule => rule.fields || allAssetFields
    });
  }

  constructRule(action, asset, $fields, $if, userInfo) {
    const rule = [action, asset];

    if (Array.isArray($fields) && typeof $fields[0] === "string")
      rule.push($fields);

    $if = { ...$if };

    if ($if) {
      Object.keys($if).forEach(key => {
        if (key[0] === "$") {
          $if[key.substring(1)] = this.getNestedValue(userInfo, $if[key]);
          delete $if[key];
        }
      });

      rule.push($if);
    }

    return rule;
  }

  createAbilities(asset, action, userType, userInfo) {
    return AbilityBuilder.define(can => {
      if (this[asset][action] && this[asset][action][userType]) {
        let { $if, $fields } = this[asset][action][userType];
        if (Array.isArray($if)) {
          $if.forEach(($fi, i) => {
            can(
              ...this.constructRule(action, asset, $fields[i], $fi, userInfo)
            );
          });
        } else {
          can(...this.constructRule(action, asset, $fields, $if, userInfo));
        }
      } else {
        if (this.denyByDefault) throw new Error("Insufficient Privileges");
        can("POST", "all");
        can("GET", "all");
        can("PATCH", "all");
        can("DELETE", "all");
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
