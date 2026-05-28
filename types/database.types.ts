/**
 * Supabase veritabanı type tanımları.
 *
 * Bu dosyayı güncellemek için:
 *   npx supabase gen types typescript --project-id lvrbzhziayegyinkcuka > types/database.types.ts
 *
 * Şema deploy edildikten sonra yukarıdaki komutu çalıştırın.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          avatar_url: string | null;
          role: 'customer' | 'baker';
          token_balance: number;
          is_customer: boolean;
          is_baker: boolean;
          wallet_balance: number;
          push_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role: 'customer' | 'baker';
          token_balance?: number;
          is_customer?: boolean;
          is_baker?: boolean;
          wallet_balance?: number;
          push_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'customer' | 'baker';
          token_balance?: number;
          is_customer?: boolean;
          is_baker?: boolean;
          wallet_balance?: number;
          push_token?: string | null;
          updated_at?: string;
        };
      };
      pastry_shops: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          images: Json;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          working_hours: Json | null;
          is_active: boolean;
          rating: number;
          review_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          cover_image_url?: string | null;
          images?: Json;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          working_hours?: Json | null;
          is_active?: boolean;
          rating?: number;
          review_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          cover_image_url?: string | null;
          images?: Json;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          working_hours?: Json | null;
          is_active?: boolean;
          rating?: number;
          review_count?: number;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          customer_id: string;
          title: string;
          description: string | null;
          photos: Json;
          serving_size: number | null;
          delivery_type: 'delivery' | 'pickup';
          delivery_address: string | null;
          delivery_latitude: number | null;
          delivery_longitude: number | null;
          delivery_date: string | null;
          delivery_time: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          status: 'pending' | 'offers_received' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled';
          selected_offer_id: string | null;
          latitude: number | null;
          longitude: number | null;
          search_radius_km: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          title: string;
          description?: string | null;
          photos?: Json;
          serving_size?: number | null;
          delivery_type: 'delivery' | 'pickup';
          delivery_address?: string | null;
          delivery_latitude?: number | null;
          delivery_longitude?: number | null;
          delivery_date?: string | null;
          delivery_time?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          status?: 'pending' | 'offers_received' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled';
          selected_offer_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          search_radius_km?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          photos?: Json;
          serving_size?: number | null;
          delivery_type?: 'delivery' | 'pickup';
          delivery_address?: string | null;
          delivery_date?: string | null;
          delivery_time?: string | null;
          status?: 'pending' | 'offers_received' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled';
          selected_offer_id?: string | null;
          updated_at?: string;
        };
      };
      offers: {
        Row: {
          id: string;
          order_id: string;
          baker_id: string;
          shop_id: string;
          price: number;
          message: string | null;
          estimated_days: number | null;
          status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          baker_id: string;
          shop_id: string;
          price: number;
          message?: string | null;
          estimated_days?: number | null;
          status?: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          price?: number;
          message?: string | null;
          estimated_days?: number | null;
          status?: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          order_id: string;
          sender_id: string;
          receiver_id: string;
          content: string | null;
          image_url: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          sender_id: string;
          receiver_id: string;
          content?: string | null;
          image_url?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          is_read?: boolean;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          data: { [key: string]: unknown };
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body?: string | null;
          data?: { [key: string]: unknown };
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          is_read?: boolean;
        };
      };
      reviews: {
        Row: {
          id: string;
          order_id: string;
          customer_id: string;
          baker_id: string;
          shop_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          customer_id: string;
          baker_id: string;
          shop_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          rating?: number;
          comment?: string | null;
        };
      };
      token_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: 'welcome_bonus' | 'order_placed' | 'refund' | 'purchase';
          description: string | null;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: 'welcome_bonus' | 'order_placed' | 'refund' | 'purchase';
          description?: string | null;
          order_id?: string | null;
          created_at?: string;
        };
        Update: never;
      };
      wallet_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: 'offer_fee' | 'top_up' | 'refund';
          description: string | null;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: 'offer_fee' | 'top_up' | 'refund';
          description?: string | null;
          order_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          type?: 'offer_fee' | 'top_up' | 'refund';
          description?: string | null;
          order_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      place_order: {
        Args: {
          p_title: string;
          p_description?: string | null;
          p_serving_size?: number | null;
          p_delivery_type?: string;
          p_delivery_address?: string | null;
          p_delivery_latitude?: number | null;
          p_delivery_longitude?: number | null;
          p_delivery_date?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_search_radius_km?: number;
        };
        Returns: { order_id: string | null; error: string | null };
      };
      accept_offer: {
        Args: { p_offer_id: string };
        Returns: { success: boolean; order_id: string | null; error: string | null };
      };
      nearby_bakers: {
        Args: {
          lat: number;
          lng: number;
          radius_km: number;
        };
        Returns: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          latitude: number;
          longitude: number;
          rating: number;
          review_count: number;
          distance_km: number;
        }[];
      };
      nearby_orders: {
        Args: {
          lat: number;
          lng: number;
          radius_km: number;
        };
        Returns: {
          id: string;
          customer_id: string;
          title: string;
          description: string | null;
          photos: Json;
          serving_size: number | null;
          delivery_type: 'delivery' | 'pickup';
          delivery_date: string | null;
          status: 'pending' | 'offers_received' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled';
          distance_km: number;
          created_at: string;
        }[];
      };
      submit_offer: {
        Args: {
          p_order_id: string;
          p_shop_id: string;
          p_price: number;
          p_message?: string | null;
          p_estimated_days?: number | null;
        };
        Returns: { offer_id: string | null; error: string | null };
      };
      reject_offer: {
        Args: { p_offer_id: string };
        Returns: { success: boolean; error: string | null };
      };
      add_wallet_balance: {
        Args: { p_amount: number };
        Returns: { new_balance: number; error: string | null };
      };
      cancel_order: {
        Args: { p_order_id: string };
        Returns: { success: boolean; error: string | null };
      };
      withdraw_offer: {
        Args: { p_offer_id: string };
        Returns: { success: boolean; refund: number; error: string | null };
      };
      get_conversations: {
        Args: Record<never, never>;
        Returns: {
          other_user_id: string;
          other_user_name: string | null;
          last_message: string | null;
          last_message_at: string | null;
          unread_count: number;
        }[];
      };
      create_notification: {
        Args: {
          p_user_id: string;
          p_type: string;
          p_title: string;
          p_body?: string | null;
          p_data?: { [key: string]: unknown };
        };
        Returns: string;
      };
      set_order_status: {
        Args: { p_order_id: string; p_status: string };
        Returns: { success: boolean; error: string | null };
      };
    };
    Enums: {
      user_role: 'customer' | 'baker';
      order_status: 'pending' | 'offers_received' | 'accepted' | 'in_progress' | 'ready' | 'completed' | 'cancelled';
      offer_status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
      delivery_type: 'delivery' | 'pickup';
      token_type: 'welcome_bonus' | 'order_placed' | 'refund' | 'offer_placed' | 'purchase';
      wallet_transaction_type: 'offer_fee' | 'top_up' | 'refund';
    };
  };
};
