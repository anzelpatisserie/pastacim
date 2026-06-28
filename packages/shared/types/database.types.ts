export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      email_campaigns: {
        Row: {
          app_target: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          sent_count: number
          subject: string
        }
        Insert: {
          app_target: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          sent_count?: number
          subject: string
        }
        Update: {
          app_target?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          sent_count?: number
          subject?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          description: string | null
          key: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          description?: string | null
          key: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          description?: string | null
          key?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedbacks: {
        Row: {
          app_name: string
          created_at: string
          id: string
          message: string
          screenshot_url: string | null
          user_id: string | null
        }
        Insert: {
          app_name?: string
          created_at?: string
          id?: string
          message: string
          screenshot_url?: string | null
          user_id?: string | null
        }
        Update: {
          app_name?: string
          created_at?: string
          id?: string
          message?: string
          screenshot_url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          created_at: string
          deleted_for: string[] | null
          id: string
          image_url: string | null
          is_read: boolean
          order_id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_for?: string[] | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          order_id: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_for?: string[] | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          order_id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          app_target: string
          body: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          notif_type: string
          sent_count: number
          title: string
        }
        Insert: {
          app_target: string
          body: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          notif_type?: string
          sent_count?: number
          title: string
        }
        Update: {
          app_target?: string
          body?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          notif_type?: string
          sent_count?: number
          title?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body: string
          description: string | null
          key: string
          target_role: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          description?: string | null
          key: string
          target_role?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          description?: string | null
          key?: string
          target_role?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          target_role: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          target_role?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          target_role?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          baker_id: string
          created_at: string
          estimated_days: number | null
          hidden_for_baker: boolean
          id: string
          message: string | null
          order_id: string
          price: number
          shop_id: string
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
        }
        Insert: {
          baker_id: string
          created_at?: string
          estimated_days?: number | null
          hidden_for_baker?: boolean
          id?: string
          message?: string | null
          order_id: string
          price: number
          shop_id: string
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
        }
        Update: {
          baker_id?: string
          created_at?: string
          estimated_days?: number | null
          hidden_for_baker?: boolean
          id?: string
          message?: string | null
          order_id?: string
          price?: number
          shop_id?: string
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_baker_id_fkey"
            columns: ["baker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "pastry_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          baker_id: string | null
          created_at: string
          customer_email: string | null
          customer_id: string
          customer_phone: string | null
          delivery_address: string | null
          delivery_date: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          delivery_time: string | null
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          description: string | null
          hidden_for_customer: boolean
          id: string
          is_urgent: boolean
          latitude: number | null
          longitude: number | null
          photos: Json
          search_radius_km: number
          selected_offer_id: string | null
          serving_size: number | null
          status: Database["public"]["Enums"]["order_status"]
          title: string
          updated_at: string
        }
        Insert: {
          baker_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id: string
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_time?: string | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          description?: string | null
          hidden_for_customer?: boolean
          id?: string
          is_urgent?: boolean
          latitude?: number | null
          longitude?: number | null
          photos?: Json
          search_radius_km?: number
          selected_offer_id?: string | null
          serving_size?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          title: string
          updated_at?: string
        }
        Update: {
          baker_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_time?: string | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          description?: string | null
          hidden_for_customer?: boolean
          id?: string
          is_urgent?: boolean
          latitude?: number | null
          longitude?: number | null
          photos?: Json
          search_radius_km?: number
          selected_offer_id?: string | null
          serving_size?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_selected_offer"
            columns: ["selected_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_baker_id_fkey"
            columns: ["baker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pastry_shops: {
        Row: {
          address: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          facebook_url: string | null
          google_maps_url: string | null
          google_rating: number | null
          google_review_count: number | null
          id: string
          images: Json
          instagram_url: string | null
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          rating: number
          review_count: number
          tiktok_url: string | null
          updated_at: string
          user_id: string
          working_hours: Json | null
          youtube_url: string | null
        }
        Insert: {
          address?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          facebook_url?: string | null
          google_maps_url?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          id?: string
          images?: Json
          instagram_url?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          rating?: number
          review_count?: number
          tiktok_url?: string | null
          updated_at?: string
          user_id: string
          working_hours?: Json | null
          youtube_url?: string | null
        }
        Update: {
          address?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          facebook_url?: string | null
          google_maps_url?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          id?: string
          images?: Json
          instagram_url?: string | null
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          rating?: number
          review_count?: number
          tiktok_url?: string | null
          updated_at?: string
          user_id?: string
          working_hours?: Json | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pastry_shops_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          app_name: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          app_name?: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          app_name?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          baker_id: string
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          is_anonymous: boolean
          order_id: string
          rating: number
          shop_id: string
        }
        Insert: {
          baker_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_anonymous?: boolean
          order_id: string
          rating: number
          shop_id: string
        }
        Update: {
          baker_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_anonymous?: boolean
          order_id?: string
          rating?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_baker_id_fkey"
            columns: ["baker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "pastry_shops"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_emails: {
        Row: {
          id: string
          order_id: string | null
          recipient_id: string
          sent_at: string
          type: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          recipient_id: string
          sent_at?: string
          type: string
        }
        Update: {
          id?: string
          order_id?: string | null
          recipient_id?: string
          sent_at?: string
          type?: string
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          type: Database["public"]["Enums"]["token_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          type: Database["public"]["Enums"]["token_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          type?: Database["public"]["Enums"]["token_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          baker_push_token: string | null
          created_at: string
          customer_push_token: string | null
          email: string | null
          email_opt_out: boolean
          email_unsub_token: string
          full_name: string | null
          id: string
          is_baker: boolean
          is_customer: boolean
          phone: string | null
          push_token: string | null
          role: Database["public"]["Enums"]["user_role"]
          token_balance: number
          updated_at: string
          wallet_balance: number
        }
        Insert: {
          avatar_url?: string | null
          baker_push_token?: string | null
          created_at?: string
          customer_push_token?: string | null
          email?: string | null
          email_opt_out?: boolean
          email_unsub_token?: string
          full_name?: string | null
          id: string
          is_baker?: boolean
          is_customer?: boolean
          phone?: string | null
          push_token?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token_balance?: number
          updated_at?: string
          wallet_balance?: number
        }
        Update: {
          avatar_url?: string | null
          baker_push_token?: string | null
          created_at?: string
          customer_push_token?: string | null
          email?: string | null
          email_opt_out?: boolean
          email_unsub_token?: string
          full_name?: string | null
          id?: string
          is_baker?: boolean
          is_customer?: boolean
          phone?: string | null
          push_token?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          token_balance?: number
          updated_at?: string
          wallet_balance?: number
        }
        Relationships: []
      }
      wallet_top_up_requests: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string
          id: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_top_up_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_offer: { Args: { p_offer_id: string }; Returns: Json }
      add_wallet_balance:
        | {
            Args: { p_amount: number }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.add_wallet_balance(p_amount => int4), public.add_wallet_balance(p_amount => numeric). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_amount: number }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.add_wallet_balance(p_amount => int4), public.add_wallet_balance(p_amount => numeric). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      admin_ban_user: {
        Args: { p_ban: boolean; p_user_id: string }
        Returns: Json
      }
      admin_broadcast: {
        Args: {
          p_app: string
          p_body: string
          p_data?: Json
          p_title: string
          p_type?: string
        }
        Returns: Json
      }
      admin_delete_feedback: {
        Args: { p_feedback_id: string }
        Returns: undefined
      }
      admin_delete_order: { Args: { p_order_id: string }; Returns: undefined }
      admin_delete_shop: { Args: { p_user_id: string }; Returns: undefined }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_get_report_messages: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: {
          content: string
          created_at: string
          id: string
          sender_id: string
        }[]
      }
      admin_get_stats: {
        Args: never
        Returns: {
          accepted_offers: number
          completed_orders: number
          pending_orders: number
          total_bakers: number
          total_customers: number
          total_offers: number
          total_orders: number
          total_revenue: number
          total_users: number
        }[]
      }
      admin_get_users_summary: {
        Args: never
        Returns: {
          accepted_offer_count: number
          completed_order_count: number
          created_at: string
          email: string
          full_name: string
          id: string
          is_baker: boolean
          is_customer: boolean
          offer_count: number
          order_count: number
          shop_address: string
          shop_is_active: boolean
          shop_lat: number
          shop_lng: number
          shop_name: string
          shop_rating: number
          shop_review_count: number
          wallet_balance: number
        }[]
      }
      admin_set_email_opt_out: {
        Args: { p_opt_out: boolean; p_user_id: string }
        Returns: Json
      }
      admin_set_report_status: {
        Args: { p_id: string; p_status: string }
        Returns: Json
      }
      admin_set_shop_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_update_email_template: {
        Args: { p_body: string; p_key: string; p_subject: string }
        Returns: Json
      }
      admin_update_notification_template: {
        Args: { p_body: string; p_key: string; p_title: string }
        Returns: Json
      }
      admin_update_user: {
        Args: {
          p_full_name?: string
          p_is_baker?: boolean
          p_is_customer?: boolean
          p_user_id: string
          p_wallet_balance?: number
        }
        Returns: undefined
      }
      approve_wallet_top_up: { Args: { p_request_id: string }; Returns: Json }
      auto_cancel_overdue_orders: { Args: never; Returns: number }
      baker_has_offer_for_order: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      cancel_order: { Args: { p_order_id: string }; Returns: Json }
      create_notification: {
        Args: {
          p_body?: string
          p_data?: Json
          p_target_role?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_shop: {
        Args: {
          p_address: string
          p_description: string
          p_facebook_url?: string
          p_google_maps_url?: string
          p_google_rating?: number
          p_google_review_count?: number
          p_instagram_url?: string
          p_latitude: number
          p_longitude: number
          p_name: string
          p_tiktok_url?: string
          p_working_hours?: Json
          p_youtube_url?: string
        }
        Returns: Json
      }
      delete_account: { Args: never; Returns: undefined }
      delete_conversation: {
        Args: { p_other_user_id: string }
        Returns: undefined
      }
      delete_message_for_me: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      earth: { Args: never; Returns: number }
      file_report: {
        Args: {
          p_app_name: string
          p_details: string
          p_reason: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      get_conversations: {
        Args: never
        Returns: {
          last_message: string
          last_message_at: string
          other_user_avatar: string
          other_user_id: string
          other_user_name: string
          unread_count: number
        }[]
      }
      get_customer_summary_for_baker: {
        Args: { p_order_id: string }
        Returns: {
          avatar_url: string
          cancelled_orders: number
          completed_orders: number
          full_name: string
          member_days: number
          member_since: string
          total_orders: number
        }[]
      }
      get_email_campaigns: {
        Args: never
        Returns: {
          app_target: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          sent_count: number
          subject: string
        }[]
        SetofOptions: {
          from: "*"
          to: "email_campaigns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_email_subscribers: {
        Args: { p_app: string }
        Returns: {
          email: string
          email_opt_out: boolean
          full_name: string
          id: string
          is_baker: boolean
          is_customer: boolean
        }[]
      }
      get_email_templates: {
        Args: never
        Returns: {
          body: string
          description: string | null
          key: string
          subject: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "email_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_notification_campaigns: {
        Args: never
        Returns: {
          app_target: string
          body: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          notif_type: string
          sent_count: number
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_campaigns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_notification_templates: {
        Args: never
        Returns: {
          body: string
          description: string | null
          key: string
          target_role: string | null
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_order_offer_summary: {
        Args: { p_order_id: string }
        Returns: {
          is_mine: boolean
          price: number
          shop_rating: number
          shop_review_count: number
        }[]
      }
      get_reports: {
        Args: never
        Returns: {
          app_name: string
          created_at: string
          details: string
          id: string
          reason: string
          reported_banned: boolean
          reported_user_email: string
          reported_user_id: string
          reported_user_name: string
          reporter_email: string
          reporter_id: string
          reporter_name: string
          status: string
          target_id: string
          target_type: string
        }[]
      }
      get_user_auth_provider: { Args: { p_email: string }; Returns: string }
      hide_order_for_me: { Args: { p_order_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      nearby_bakers: {
        Args: { lat: number; lng: number; radius_km?: number }
        Returns: {
          cover_image_url: string
          description: string
          distance_km: number
          id: string
          latitude: number
          longitude: number
          name: string
          rating: number
          review_count: number
          user_id: string
        }[]
      }
      nearby_orders: {
        Args: { lat: number; lng: number; radius_km: number }
        Returns: {
          created_at: string
          customer_avatar_url: string
          customer_completed_orders: number
          customer_full_name: string
          customer_id: string
          customer_member_days: number
          customer_total_orders: number
          delivery_address: string
          delivery_date: string
          delivery_time: string
          delivery_type: string
          description: string
          distance_km: number
          id: string
          is_urgent: boolean
          photos: Json
          serving_size: number
          status: string
          title: string
        }[]
      }
      notify_new_message: {
        Args: {
          p_preview: string
          p_push?: boolean
          p_receiver_id: string
          p_sender_id: string
          p_target_role: string
        }
        Returns: undefined
      }
      place_order:
        | {
            Args: {
              p_delivery_address?: string
              p_delivery_date?: string
              p_delivery_latitude?: number
              p_delivery_longitude?: number
              p_delivery_type?: string
              p_description?: string
              p_latitude?: number
              p_longitude?: number
              p_search_radius_km?: number
              p_serving_size?: number
              p_title: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_delivery_address?: string
              p_delivery_date?: string
              p_delivery_latitude?: number
              p_delivery_longitude?: number
              p_delivery_time?: string
              p_delivery_type?: string
              p_description?: string
              p_is_urgent?: boolean
              p_latitude?: number
              p_longitude?: number
              p_search_radius_km?: number
              p_serving_size?: number
              p_title: string
            }
            Returns: Json
          }
      register_push_token:
        | { Args: { p_token: string }; Returns: undefined }
        | { Args: { p_app: string; p_token: string }; Returns: undefined }
      reject_offer: { Args: { p_offer_id: string }; Returns: Json }
      request_wallet_top_up: {
        Args: { p_amount: number; p_note?: string }
        Returns: Json
      }
      set_order_status:
        | {
            Args: {
              p_order_id: string
              p_status: Database["public"]["Enums"]["order_status"]
            }
            Returns: Json
          }
        | { Args: { p_order_id: string; p_status: string }; Returns: Json }
      submit_offer: {
        Args: {
          p_estimated_days?: number
          p_message?: string
          p_order_id: string
          p_price: number
          p_shop_id: string
        }
        Returns: Json
      }
      withdraw_offer: { Args: { p_offer_id: string }; Returns: Json }
    }
    Enums: {
      delivery_type: "delivery" | "pickup"
      offer_status: "pending" | "accepted" | "rejected" | "withdrawn"
      order_status:
        | "pending"
        | "offers_received"
        | "accepted"
        | "in_progress"
        | "ready"
        | "completed"
        | "cancelled"
      token_type:
        | "welcome_bonus"
        | "order_placed"
        | "refund"
        | "purchase"
        | "offer_placed"
      user_role: "customer" | "baker"
      wallet_transaction_type: "offer_fee" | "top_up" | "refund"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      delivery_type: ["delivery", "pickup"],
      offer_status: ["pending", "accepted", "rejected", "withdrawn"],
      order_status: [
        "pending",
        "offers_received",
        "accepted",
        "in_progress",
        "ready",
        "completed",
        "cancelled",
      ],
      token_type: [
        "welcome_bonus",
        "order_placed",
        "refund",
        "purchase",
        "offer_placed",
      ],
      user_role: ["customer", "baker"],
      wallet_transaction_type: ["offer_fee", "top_up", "refund"],
    },
  },
} as const
