import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const orderItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    notes: { type: String },
  },
  { _id: true }
);

const addressSchema = new Schema(
  {
    mode: { type: String, enum: ['gps', 'manual'], required: true },
    city: { type: String },
    district: { type: String },
    street: { type: String },
    number: { type: String },
    reference: { type: String },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    appId: { type: Schema.Types.ObjectId, ref: 'AppProject', required: true, index: true },
    code: { type: String, required: true, index: true }, // Display code
    customerName: { type: String, required: true },
    phone: { type: String },
    
    type: { type: String, enum: ['delivery', 'takeout', 'table'], required: true },
    tableId: { type: String }, // If type === table
    
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    serviceFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    
    paymentMethod: { type: String, enum: ['pix', 'dinheiro', 'cartao', 'nao_informado'], required: true },
    changeFor: { type: Number }, // Troco para
    
    address: { type: addressSchema },
    
    status: { 
      type: String, 
      enum: ['novo', 'aceito', 'a_caminho', 'entregue', 'cancelado', 'finalizado'], 
      default: 'novo',
      index: true
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export type OrderDoc = InferSchemaType<typeof orderSchema> & { _id: Types.ObjectId };
export const Order = model('Order', orderSchema);
