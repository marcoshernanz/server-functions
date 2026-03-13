function isUseServerModule(program) {
  return program.body.some(
    (statement) =>
      statement.type === "ExpressionStatement" &&
      statement.directive === "use server",
  );
}

function isServerFunctionCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "serverFunction"
  );
}

function getPropertyByName(objectExpression, propertyName) {
  return objectExpression.properties.find(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      ((property.key.type === "Identifier" && property.key.name === propertyName) ||
        (property.key.type === "Literal" && property.key.value === propertyName)),
  );
}

function traverse(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }

  visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "loc" || key === "range") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item, visitor);
      }

      continue;
    }

    traverse(value, visitor);
  }
}

const preferServerFunctionRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require exported server functions in 'use server' modules to use serverFunction(...)",
    },
    schema: [],
    messages: {
      preferServerFunction:
        "Exported functions in 'use server' modules should be defined with serverFunction(...).",
    },
  },
  create(context) {
    return {
      Program(program) {
        if (!isUseServerModule(program)) {
          return;
        }

        for (const statement of program.body) {
          if (statement.type === "ExportNamedDeclaration") {
            const declaration = statement.declaration;

            if (!declaration) {
              continue;
            }

            if (declaration.type === "FunctionDeclaration") {
              context.report({
                node: declaration,
                messageId: "preferServerFunction",
              });
            }

            if (declaration.type === "VariableDeclaration") {
              for (const declarator of declaration.declarations) {
                if (!isServerFunctionCall(declarator.init)) {
                  context.report({
                    node: declarator,
                    messageId: "preferServerFunction",
                  });
                }
              }
            }
          }

          if (
            statement.type === "ExportDefaultDeclaration" &&
            statement.declaration.type === "FunctionDeclaration"
          ) {
            context.report({
              node: statement.declaration,
              messageId: "preferServerFunction",
            });
          }
        }
      },
    };
  },
};

const noWholeInputForwardingRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow forwarding the entire validated input object into a data write",
    },
    schema: [],
    messages: {
      noWholeInputForwarding:
        "Do not forward the full input object into `data`. Explicitly whitelist written fields.",
    },
  },
  create(context) {
    return {
      "CallExpression[callee.name='serverFunction']"(node) {
        const [config] = node.arguments;

        if (!config || config.type !== "ObjectExpression") {
          return;
        }

        const handlerProperty = getPropertyByName(config, "handler");

        if (
          !handlerProperty ||
          handlerProperty.value.type !== "ArrowFunctionExpression"
        ) {
          return;
        }

        const handler = handlerProperty.value;
        const inputParam = handler.params[1];

        if (!inputParam || inputParam.type !== "Identifier") {
          return;
        }

        const inputName = inputParam.name;

        traverse(handler.body, (childNode) => {
          if (childNode.type !== "Property" || childNode.computed) {
            return;
          }

          const isDataProperty =
            (childNode.key.type === "Identifier" &&
              childNode.key.name === "data") ||
            (childNode.key.type === "Literal" && childNode.key.value === "data");

          if (!isDataProperty) {
            return;
          }

          if (
            childNode.value.type === "Identifier" &&
            childNode.value.name === inputName
          ) {
            context.report({
              node: childNode.value,
              messageId: "noWholeInputForwarding",
            });
          }
        });
      },
    };
  },
};

export default {
  rules: {
    "prefer-server-function": preferServerFunctionRule,
    "no-whole-input-forwarding": noWholeInputForwardingRule,
  },
};
