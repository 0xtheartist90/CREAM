import { FinanceApp } from '@/components/finance/app';
import { FinanceProvider } from '@/lib/finance/store';

const Page = () => {
    return (
        <FinanceProvider>
            <FinanceApp />
        </FinanceProvider>
    );
};

export default Page;
