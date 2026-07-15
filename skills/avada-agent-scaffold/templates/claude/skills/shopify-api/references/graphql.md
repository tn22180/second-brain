# GraphQL Admin API Patterns

## Basic Query

```javascript
const query = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      variants(first: 10) {
        nodes {
          id
          price
        }
      }
    }
  }
`;

const response = await shopify.graphql(query, { id: productId });
```

## Pagination Pattern

```javascript
async function getAllProducts(shopify) {
  const products = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo { hasNextPage }
          edges {
            cursor
            node { id title }
          }
        }
      }
    `;

    const response = await shopify.graphql(query, { cursor });
    const { edges, pageInfo } = response.products;

    products.push(...edges.map(e => e.node));
    hasNextPage = pageInfo.hasNextPage;
    cursor = edges[edges.length - 1]?.cursor;
  }

  return products;
}
```

## Nodes vs Edges Pattern

```javascript
// Using nodes (simpler, no cursor access)
const query = `
  query {
    products(first: 10) {
      nodes {
        id
        title
      }
    }
  }
`;

// Using edges (when you need cursor for pagination)
const query = `
  query {
    products(first: 10) {
      edges {
        cursor
        node {
          id
          title
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
```

## Mutation Pattern

```javascript
const mutation = `
  mutation updateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const response = await shopify.graphql(mutation, {
  input: {
    id: productId,
    title: 'New Title'
  }
});

if (response.productUpdate.userErrors.length > 0) {
  throw new Error(response.productUpdate.userErrors[0].message);
}
```

## Query Cost Management

```javascript
// Check query cost before expensive operations
const response = await shopify.graphql(query);

// Cost info in response extensions
console.log('Query cost:', response.extensions.cost);
// {
//   requestedQueryCost: 52,
//   actualQueryCost: 52,
//   throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 948 }
// }
```
