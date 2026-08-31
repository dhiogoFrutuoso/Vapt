import { 
  TbBurger, 
  TbSalt, 
  TbBeer, 
  TbToolsKitchen2, 
  TbPizza, 
  TbCoffee, 
  TbShoppingCart, 
  TbQrcode, 
  TbCash, 
  TbCreditCard, 
  TbPackage,
  TbBuildingStore
} from 'react-icons/tb';

type Props = {
  name?: string;
  size?: number | string;
  className?: string;
};

export function IconRenderer({ name, size, className }: Props) {
  const iconProps = { size, className };

  switch (name) {
    case 'burger': return <TbBurger {...iconProps} />;
    case 'fries': return <TbSalt {...iconProps} />;
    case 'beer': return <TbBeer {...iconProps} />;
    case 'restaurant': return <TbToolsKitchen2 {...iconProps} />;
    case 'pizza': return <TbPizza {...iconProps} />;
    case 'coffee': return <TbCoffee {...iconProps} />;
    case 'cart': return <TbShoppingCart {...iconProps} />;
    case 'pix': return <TbQrcode {...iconProps} />;
    case 'cash': return <TbCash {...iconProps} />;
    case 'card': return <TbCreditCard {...iconProps} />;
    case 'store': return <TbBuildingStore {...iconProps} />;
    default: return <TbPackage {...iconProps} />;
  }
}
