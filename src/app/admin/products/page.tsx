import AdminLayout from '../layout';
import ProductsClient from './ProductsClient';

export const metadata = {
    title: 'Product List | Admin',
};

export default function ProductsPage() {
    return (
        <ProductsClient />
    );
}
