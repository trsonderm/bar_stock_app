import { Suspense } from 'react';
import ProductsClient from './ProductsClient';

export const metadata = {
    title: 'Product List | Topshelf Stock',
};

export default function ProductsPage() {
    return (
        <Suspense>
            <ProductsClient />
        </Suspense>
    );
}
