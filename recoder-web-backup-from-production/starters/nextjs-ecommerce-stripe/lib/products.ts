export interface Product {
  id: string
  name: string
  price: number // in cents
  image: string
  description: string
}

export const products: Product[] = [
  {
    id: '1',
    name: 'Premium T-Shirt',
    price: 2999,
    image: 'https://via.placeholder.com/300',
    description: 'High-quality cotton t-shirt'
  },
  {
    id: '2',
    name: 'Classic Jeans',
    price: 4999,
    image: 'https://via.placeholder.com/300',
    description: 'Comfortable denim jeans'
  },
  {
    id: '3',
    name: 'Sneakers',
    price: 7999,
    image: 'https://via.placeholder.com/300',
    description: 'Stylish and comfortable sneakers'
  }
]
